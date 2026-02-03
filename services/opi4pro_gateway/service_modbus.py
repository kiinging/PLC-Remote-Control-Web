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
    hr=ModbusSequentialDataBlock(0, [0]*32), # ✅ Size 32 (Indices 0-31)
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
            rtd = db.get_state("rtd_temp", 0.0) or 0.0
            
            web_status  = 1 if db.get_state("web", 0) else 0
            mode_status = db.get_state("mode", 0)
            plc_status  = 1 if db.get_state("plc_status", 0) else 0

            # --- Update Holding Registers (GW -> PLC) ---
            # HR0-1: RTD
            reg0, reg1 = struct.unpack(">HH", struct.pack(">f", rtd))
            
            # HR3: Mode (HR2 is Mode Ack)
            reg3 = mode_status
            
            # HR5: Web Status (HR4 is Web Ack)
            reg5 = web_status
            
            # HR7: PLC Status (HR6 is PLC Ack)
            reg7 = plc_status
            
            # Write Block HR0..HR7
            # HR0-1 (RTD)
            store.setValues(3, 0, [reg0, reg1])
            
            # HR3 (Mode)
            store.setValues(3, 3, [reg3])
            
            # HR5 (Web Status)
            store.setValues(3, 5, [reg5])
            
            # HR7 (PLC Status)
            store.setValues(3, 7, [reg7])
            

            # --- Handshakes (GW -> PLC) ---

            # 1. Manual MV (HR8 Flag, HR9-10 Data)
            if db.get_state("mv_manual_update_pending", False):
                mv_value = db.get_state("mv_manual", 0.0)
                mv0, mv1 = struct.unpack(">HH", struct.pack(">f", mv_value))
                store.setValues(3, 8, [1, mv0, mv1]) # HR8=1, HR9=mv0, HR10=mv1
                db.set_state("mv_manual_update_pending", False)

            # 2. PID Handshake (HR11 Flag, HR12-17 Data)
            if db.get_state("pid_update_pending", False):
                pb = db.get_state("pid_pb", 0.0)
                ti = db.get_state("pid_ti", 0.0)
                td = db.get_state("pid_td", 0.0)
                
                pb0, pb1 = struct.unpack(">HH", struct.pack(">f", pb))
                ti0, ti1 = struct.unpack(">HH", struct.pack(">f", ti))
                td0, td1 = struct.unpack(">HH", struct.pack(">f", td))
                
                # HR11=1, HR12-13=PB, HR14-15=TI, HR16-17=TD
                store.setValues(3, 11, [1, pb0, pb1, ti0, ti1, td0, td1])
                db.set_state("pid_update_pending", False)

            # 3. Setpoint Handshake (HR18 Flag, HR19-20 Data)
            # Unified for both Auto and Tune modes
            if db.get_state("setpoint_update_pending", False):
                sp = db.get_state("setpoint", 0.0)
                sp0, sp1 = struct.unpack(">HH", struct.pack(">f", sp))
                store.setValues(3, 18, [1, sp0, sp1]) # HR18=1, HR19=sp0, HR20=sp1
                db.set_state("setpoint_update_pending", False)

            # (Removed separate Tune Setpoint Handshake - using shared HR18-20)

            # 4. Tune Start (HR24 Flag)
            if db.get_state("tune_start_pending", False):
                store.setValues(3, 24, [1])
                db.set_state("tune_start_pending", False)
                db.set_state("tune_completed", False)

            # 5. Tune Stop (HR26 Flag)
            if db.get_state("tune_stop_pending", False):
                store.setValues(3, 26, [1])
                db.set_state("tune_stop_pending", False)
                db.set_state("tune_in_progress", False)


            # --- Read back from PLC (Holding Registers) ---
            # Read up to HR27 (Size 28)
            hr_values = store.getValues(3, 0, count=28) 

            # 1. Mode Ack (HR2)
            mode_req = db.get_state("mode", 0)
            mode_ack = hr_values[2]
            if mode_req == mode_ack:
                 db.set_state("mode_acknowledged", True)
            else:
                 db.set_state("mode_acknowledged", False)

            # 2. Web Ack (HR4)
            web_req = db.get_state("web", 0)
            web_ack_plc = hr_values[4] 
            if (web_req == 1 and web_ack_plc == 1) or (web_req == 0 and web_ack_plc == 0):
                db.set_state("web_acknowledged", True)

            # 3. PLC Ack (HR6)
            plc_req = db.get_state("plc_status", 0)
            plc_ack_plc = hr_values[6]
            if (plc_req == 1 and plc_ack_plc == 1) or (plc_req == 0 and plc_ack_plc == 0):
                db.set_state("plc_acknowledged", True)

            # 4. Manual MV Ack (HR8)
            if hr_values[8] == 0 and not db.get_state("mv_manual_acknowledged", False):
                db.set_state("mv_manual_acknowledged", True)

            # 5. PID Ack (HR11)
            if hr_values[11] == 0 and not db.get_state("pid_acknowledged", False):
                db.set_state("pid_acknowledged", True)

            # 6. Setpoint Ack (HR18)
            if hr_values[18] == 0 and not db.get_state("setpoint_acknowledged", False):
                db.set_state("setpoint_acknowledged", True)

            # 7. Tune Start Ack (HR23) -- NEW
            # If HR23 (Ack) == 1, it means PLC accepted Start command.
            # We can use this to confirm 'tune_in_progress' state if desired, 
            # OR we maintain the original logic where we just set it pending.
            # Ideally: GW sets Flag=1. PLC sets Ack=1.
            # If we see Ack=1, we can confirm start.
            tune_start_ack = hr_values[23]
            if tune_start_ack == 1:
                db.set_state("tune_start_acknowledged", True)
                db.set_state("tune_in_progress", True)
                # Optional: We could clear the Start Flag (HR24) here if we wanted strictly transient,
                # but usually we let the PLC clear the Ack/Flag or we clear our Flag request.
                # In this system, logic is often "Write 1, PLC reads, PLC writes 0 to Flag".
                # If PLC clears Flag (HR24) to 0, that is the Ack.
                # BUT user requested Explicit Ack Register.
                # so: GW sets HR24=1. PLC sets HR23=1.
                # Later, GW sets HR24=0? Or PLC clears it?
                # Let's assume: PLC copies Flag to Ack.
                # So if HR24=1 and HR23=1, we are good.
                pass

            # 8. Tune Stop Ack (HR25) -- NEW
            tune_stop_ack = hr_values[25]
            if tune_stop_ack == 1:
                db.set_state("tune_stop_acknowledged", True)
                db.set_state("tune_in_progress", False)
            
            # 9. Tune Done (HR27)
            if hr_values[27] == 1 and not db.get_state("tune_completed", False):
                # PID vals at HR12-17
                pb = struct.unpack(">f", struct.pack(">HH", hr_values[12], hr_values[13]))[0]
                ti = struct.unpack(">f", struct.pack(">HH", hr_values[14], hr_values[15]))[0]
                td = struct.unpack(">f", struct.pack(">HH", hr_values[16], hr_values[17]))[0]
                
                db.set_state("pid_pb", pb)
                db.set_state("pid_ti", ti)
                db.set_state("pid_td", td)
                
                db.set_state("tune_in_progress", False)
                db.set_state("tune_completed", True)
                
                store.setValues(3, 27, [0]) # Clear Done Flag

            # 10. MV Feedback (HR21-22)
            mv_val = struct.unpack(">f", struct.pack(">HH", hr_values[21], hr_values[22]))[0]
            
            db.set_state("mv", mv_val)
            db.set_state("pv_source", "rtd")

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
