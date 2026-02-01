# modbus_server.py

import struct
import time
import threading
import logging
import logging.handlers

from pymodbus.server.sync import StartTcpServer
from pymodbus.datastore import ModbusSequentialDataBlock, ModbusSlaveContext, ModbusServerContext
from pymodbus.device import ModbusDeviceIdentification

from database import db  # SQLite wrapper
import config

# Setup logger
logger = logging.getLogger("modbus_server")
logger.setLevel(config.LOG_LEVEL)

# Use RotatingFileHandler
file_handler = logging.handlers.RotatingFileHandler(
    config.MODBUS_LOG_FILE, maxBytes=5*1024*1024, backupCount=3
)
file_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
file_handler.setFormatter(file_formatter)

console_handler = logging.StreamHandler()
console_handler.setFormatter(file_formatter)

logger.addHandler(file_handler)
logger.addHandler(console_handler)

# Modbus data store
store = ModbusSlaveContext(
    di=ModbusSequentialDataBlock(0, [0]*10),
    co=ModbusSequentialDataBlock(0, [0]*10),
    hr=ModbusSequentialDataBlock(0, [0]*30),
    ir=ModbusSequentialDataBlock(0, [0]*20),
)
context = ModbusServerContext(slaves=store, single=True)

def update_modbus_registers():
    """Reads SQLite and updates Modbus Input Registers every second."""
    while True:
        try:
            # Update heartbeat
            db.set_state("modbus_last_tick_ts", time.time())
            
            # --- Read State from DB ---
            # tc = db.get_state("thermo_temp", 0.0) or 0.0
            tc = 0.0 # TC removed, sending 0.0 to HR0-1 to maintain alignment
            rtd = db.get_state("rtd_temp", 0.0) or 0.0
            
            web_status  = 1 if db.get_state("web", 0) else 0
            mode_status = db.get_state("mode", 0)
            plc_status  = 1 if db.get_state("plc", 0) else 0

            # --- Update Input Registers (IR) ---
            # Pack floats
            reg0, reg1 = struct.unpack(">HH", struct.pack(">f", tc))
            reg2, reg3 = struct.unpack(">HH", struct.pack(">f", rtd))

            reg4 = mode_status
            reg5 = plc_status
            reg6 = web_status

            store.setValues(3, 0, [reg0, reg1, reg2, reg3, reg4, reg5, reg6]) # IR0..IR6 (mapped to HR0..6 in code?) 
            # Note: Context uses '3' as function code for holding registers in setValues? 
            # The original code used 3 (Holding Registers). We stick to it.

            # --- Manual MV Handshake (HR7-HR9) ---
            if db.get_state("mv_manual_update_pending", False):
                mv_value = db.get_state("mv_manual", 0.0)
                mv0, mv1 = struct.unpack(">HH", struct.pack(">f", mv_value))
                store.setValues(3, 7, [1, mv0, mv1])
                db.set_state("mv_manual_update_pending", False)

            # --- PID Handshake (HR10-HR16) ---
            if db.get_state("pid_update_pending", False):
                pb = db.get_state("pid_pb", 0.0)
                ti = db.get_state("pid_ti", 0.0)
                td = db.get_state("pid_td", 0.0)
                
                pb0, pb1 = struct.unpack(">HH", struct.pack(">f", pb))
                ti0, ti1 = struct.unpack(">HH", struct.pack(">f", ti))
                td0, td1 = struct.unpack(">HH", struct.pack(">f", td))
                
                store.setValues(3, 10, [1, pb0, pb1, ti0, ti1, td0, td1])
                db.set_state("pid_update_pending", False)

            # --- Setpoint Handshake (HR17-HR19) ---
            if db.get_state("setpoint_update_pending", False):
                sp = db.get_state("setpoint", 0.0)
                sp0, sp1 = struct.unpack(">HH", struct.pack(">f", sp))
                store.setValues(3, 17, [1])
                store.setValues(3, 18, [sp0, sp1])
                db.set_state("setpoint_update_pending", False)

            # --- Tune Setpoint Handshake (HR24) ---
            if db.get_state("tune_setpoint_update_pending", False):
                tune_sp = db.get_state("tune_setpoint", 0.0)
                sp0, sp1 = struct.unpack(">HH", struct.pack(">f", tune_sp))
                store.setValues(3, 24, [1])
                store.setValues(3, 18, [sp0, sp1]) # Reusing HR18-19
                db.set_state("tune_setpoint_update_pending", False)

            # --- Tune Start (HR25) ---
            if db.get_state("tune_start_pending", False):
                store.setValues(3, 25, [1])
                db.set_state("tune_start_pending", False)
                db.set_state("tune_completed", False)

            # --- Tune Stop (HR26) ---
            if db.get_state("tune_stop_pending", False):
                store.setValues(3, 26, [1])
                db.set_state("tune_stop_pending", False)
                db.set_state("tune_in_progress", False)



            # --- Read back from PLC (Holding Registers) ---
            hr_values = store.getValues(3, 0, count=31)

            # 1. Manual MV Ack (HR7)
            if hr_values[7] == 0 and not db.get_state("mv_manual_acknowledged", False):
                db.set_state("mv_manual_acknowledged", True)

            # 2. PID Ack (HR10)
            if hr_values[10] == 0 and not db.get_state("pid_acknowledged", False):
                db.set_state("pid_acknowledged", True)

            # 3. Setpoint Ack (HR17)
            if hr_values[17] == 0 and not db.get_state("setpoint_acknowledged", False):
                db.set_state("setpoint_acknowledged", True)

            # 4. Tune Setpoint Ack (HR24)
            if hr_values[24] == 0 and not db.get_state("tune_setpoint_acknowledged", False):
                db.set_state("tune_setpoint_acknowledged", True)

            # 5. Tune Start Ack (HR25)
            if hr_values[25] == 0 and not db.get_state("tune_start_acknowledged", False):
                db.set_state("tune_start_acknowledged", True)
                db.set_state("tune_in_progress", True)

            # 6. Tune Stop Ack (HR26)
            if hr_values[26] == 0 and not db.get_state("tune_stop_acknowledged", False):
                db.set_state("tune_stop_acknowledged", True)
                db.set_state("tune_in_progress", False)

            # 9. Web Control Ack (HR21)
            # Check if PLC has echoed the web status
            web_req = db.get_state("web", 0)
            web_ack_plc = hr_values[21] # HR21

            if web_req == 1 and web_ack_plc == 1:
                db.set_state("web_acknowledged", True)
            elif web_req == 0 and web_ack_plc == 0:
                db.set_state("web_acknowledged", True)
            
            # --- Tune Completion (HR27)
            if hr_values[27] == 1 and not db.get_state("tune_completed", False):
                # Read new PID params
                pb = struct.unpack(">f", struct.pack(">HH", hr_values[11], hr_values[12]))[0]
                ti = struct.unpack(">f", struct.pack(">HH", hr_values[13], hr_values[14]))[0]
                td = struct.unpack(">f", struct.pack(">HH", hr_values[15], hr_values[16]))[0]
                
                db.set_state("pid_pb", pb)
                db.set_state("pid_ti", ti)
                db.set_state("pid_td", td)
                
                db.set_state("tune_in_progress", False)
                db.set_state("tune_completed", True)
                
                # Reset HR27
                store.setValues(3, 27, [0])

            # 8. Read Status & MV
            sensor_select = hr_values[20]

            mv = struct.unpack(">f", struct.pack(">HH", hr_values[22], hr_values[23]))[0]

            db.set_state("sensor_select", sensor_select)
            

            db.set_state("mv", mv)
            db.set_state("pv_source", "thermo" if sensor_select == 0 else "rtd")

        except Exception as e:
            logger.error(f"Error updating Modbus registers: {e}")
            time.sleep(1)

        time.sleep(config.MODBUS_UPDATE_INTERVAL)

def main():
    identity = ModbusDeviceIdentification()
    identity.VendorName = "OrangePi"
    identity.ProductCode = "OPI-Z3"
    identity.ProductName = "Temp & Control Gateway"
    identity.ModelName = "OrangePi 4 Pro"
    identity.MajorMinorRevision = "2.0"

    # Start update thread
    threading.Thread(target=update_modbus_registers, daemon=True).start()

    # Run Modbus TCP server
    logger.info(f"Starting Modbus TCP Server at {config.MODBUS_HOST}:{config.MODBUS_PORT}")
    StartTcpServer(context, identity=identity, address=(config.MODBUS_HOST, config.MODBUS_PORT))

if __name__ == "__main__":
    main()
