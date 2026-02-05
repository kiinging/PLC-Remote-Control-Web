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
            if db.get_state("mv_req", False):
                mv_value = db.get_state("mv_manual", 0.0)
                mv0, mv1 = struct.unpack(">HH", struct.pack(">f", mv_value))
                store.setValues(3, 8, [1, mv0, mv1]) # HR8=1, HR9=mv0, HR10=mv1
                db.set_state("mv_req", False)

            # 2. PID Handshake (HR11 Flag, HR12-17 Data)
            if db.get_state("pid_req", False):
                pb = db.get_state("pid_pb", 0.0)
                ti = db.get_state("pid_ti", 0.0)
                td = db.get_state("pid_td", 0.0)
                
                pb0, pb1 = struct.unpack(">HH", struct.pack(">f", pb))
                ti0, ti1 = struct.unpack(">HH", struct.pack(">f", ti))
                td0, td1 = struct.unpack(">HH", struct.pack(">f", td))
                
                # HR11=1, HR12-13=PB, HR14-15=TI, HR16-17=TD
                store.setValues(3, 11, [1, pb0, pb1, ti0, ti1, td0, td1])
                db.set_state("pid_req", False)

            # 3. Setpoint Handshake (HR18 Flag, HR19-20 Data)
            # Unified for both Auto and Tune modes
            if db.get_state("sp_req", False):
                sp = db.get_state("setpoint", 0.0)
                sp0, sp1 = struct.unpack(">HH", struct.pack(">f", sp))
                store.setValues(3, 18, [1, sp0, sp1]) # HR18=1, HR19=sp0, HR20=sp1
                db.set_state("sp_req", False)

            # 4. Tune Status (HR24)
            # 1 = Start Tuning, 0 = Stop Tuning
            tune_current_cmd = db.get_state("tune_status", 0)
            store.setValues(3, 24, [tune_current_cmd])


            # --- Read back from PLC (Holding Registers) ---
            # Read up to HR25 (Size 26) - Expanded to include HR25 Tune Done
            hr_values = store.getValues(3, 0, count=26) 

            # 1. Mode Ack (HR2)
            mode_req = db.get_state("mode", 0)
            mode_ack = hr_values[2]
            if mode_req == mode_ack:
                 db.set_state("mode_ack", True)
            else:
                 db.set_state("mode_ack", False)

            # 2. Web Ack (HR4)
            web_req = db.get_state("web", 0)
            web_ack_plc = hr_values[4] 
            if (web_req == 1 and web_ack_plc == 1) or (web_req == 0 and web_ack_plc == 0):
                db.set_state("web_ack", True)

            # 3. PLC Ack (HR6)
            plc_req = db.get_state("plc_status", 0)
            plc_ack_plc = hr_values[6]
            if (plc_req == 1 and plc_ack_plc == 1) or (plc_req == 0 and plc_ack_plc == 0):
                db.set_state("plc_ack", True)

            # 4. Manual MV Ack (HR8)
            if hr_values[8] == 0 and not db.get_state("mv_ack", False):
                db.set_state("mv_ack", True)

            # 5. PID Ack (HR11)
            if hr_values[11] == 0 and not db.get_state("pid_ack", False):
                db.set_state("pid_ack", True)

            # 6. Setpoint Ack (HR18)
            if hr_values[18] == 0 and not db.get_state("sp_ack", False):
                db.set_state("sp_ack", True)

            # 7. Tune Status Ack (HR23)
            # PLC mirrors HR24 (Tune Status) to HR23
            # If HR23 == tune_current_cmd, then Acked.
            tune_status_ack = hr_values[23]
            if tune_status_ack == tune_current_cmd:
                # We can store an ack state if we want, mostly likely for UI
                # But UI only cares about 'tune_status' (requested) mostly.
                # Could add 'tune_ack' state if needed.
                pass 
            
            # 8. Tune Done (HR25)
            # If HR25 == 1, Tuning is Done.
            if hr_values[25] == 1 and not db.get_state("tune_done", False):
                # Update PID Params from PLC (HR12-17)
                pb = struct.unpack(">f", struct.pack(">HH", hr_values[12], hr_values[13]))[0]
                ti = struct.unpack(">f", struct.pack(">HH", hr_values[14], hr_values[15]))[0]
                td = struct.unpack(">f", struct.pack(">HH", hr_values[16], hr_values[17]))[0]
                
                db.set_state("pid_pb", pb)
                db.set_state("pid_ti", ti)
                db.set_state("pid_td", td)
                
                db.set_state("tune_status", 0) # Reset to Stop
                db.set_state("tune_done", True)
                
                store.setValues(3, 25, [0]) # Clear Done Flag on our side? 
                # Actually, PLC writes 1. We should write 0 to Ack? 
                # Or does PLC pulse it? Assuming PLC holds it until we reset tune_status.
                # Let's clear it to be safe or just trust we read it.
                # If we write 0 to HR25, we are effectively Acking the Done.
                store.setValues(3, 25, [0]) 

            # 9. MV Feedback (HR21-22)
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
