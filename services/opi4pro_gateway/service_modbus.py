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
    hr=ModbusSequentialDataBlock(0, [0]*120), # ✅ Size 120 (Covering up to HR110)
    ir=ModbusSequentialDataBlock(0, [0]*20),
)
context = ModbusServerContext(slaves=store, single=True)

def update_modbus_registers():
    """Reads SQLite and updates Modbus Registers with Sequence Handshake."""
    
    # Internal state to track changes
    last_tx_state = {} 
    gw_tx_seq = 0
    last_plc_heartbeat = -1
    
    while True:
        try:
            # Update heartbeat for Gateway Service itself
            db.set_state("modbus_last_tick_ts", time.time())
            
            # --- 1. Read Command State from DB ---
            current_state = {
                "rtd": db.get_state("rtd_temp", 0.0) or 0.0,
                "web_status": 1 if db.get_state("web", 0) else 0,
                "mode": db.get_state("mode", 0),
                "plc_status": 1 if db.get_state("plc_status", 0) else 0,
                "mv_manual": db.get_state("mv_manual", 0.0),
                "setpoint": db.get_state("setpoint", 0.0),
                "pid_pb": db.get_state("pid_pb", 0.0),
                "pid_ti": db.get_state("pid_ti", 0.0),
                "pid_td": db.get_state("pid_td", 0.0),
                "tune_cmd": db.get_state("tune_status", 0) # 1=Start, 0=Stop
            }
            
            # --- 2. Check for Changes (Increment Sequence) ---
            # Compare current state with last transmitted state
            # If any value changes, we increment the sequence number.
            has_changed = False
            for key, val in current_state.items():
                if key not in last_tx_state or last_tx_state[key] != val:
                    has_changed = True
                    break
            
            if has_changed:
                gw_tx_seq = (gw_tx_seq + 1) % 65535
                last_tx_state = current_state.copy()
                logger.info(f"Command changed. Incrementing gw_tx_seq to {gw_tx_seq}")

            # --- 3. Write GW -> PLC Block (HR0 - HR16) ---
            # HR0: gw_tx_seq
            # HR1-2: RTD
            # HR3: Web Status
            # HR4: Mode
            # HR5: PLC Status
            # HR6-7: MV Manual
            # HR8-9: Setpoint
            # HR10: Tune Command
            # HR11-12: PID PB
            # HR13-14: PID Ti
            # HR15-16: PID Td
            
            registers = [gw_tx_seq] # HR0
            
            # Helper for float packing
            def pack_float(f):
                return list(struct.unpack(">HH", struct.pack(">f", f)))

            registers.extend(pack_float(current_state["rtd"]))        # HR1-2
            registers.append(current_state["web_status"])             # HR3
            registers.append(current_state["mode"])                   # HR4
            registers.append(current_state["plc_status"])             # HR5
            registers.extend(pack_float(current_state["mv_manual"]))  # HR6-7
            registers.extend(pack_float(current_state["setpoint"]))   # HR8-9
            registers.append(current_state["tune_cmd"])               # HR10
            registers.extend(pack_float(current_state["pid_pb"]))     # HR11-12
            registers.extend(pack_float(current_state["pid_ti"]))     # HR13-14
            registers.extend(pack_float(current_state["pid_td"]))     # HR15-16
            
            # Write all in one block
            store.setValues(3, 0, registers)
            
            
            # --- 4. Read PLC -> GW Block (HR100 - HR110) ---
            # Size 11 registers
            plc_data = store.getValues(3, 100, count=11)
            
            # HR100: plc_rx_seq
            plc_rx_seq = plc_data[0]
            
            # Verify Ack
            if plc_rx_seq == gw_tx_seq:
                db.set_state("modbus_plc_synced", True)
                # We could set individual acks here if needed for legacy UI compatibility
                db.set_state("mode_ack", True)
                db.set_state("web_ack", True)
                db.set_state("plc_ack", True)
                db.set_state("mv_ack", True)
                db.set_state("sp_ack", True)
                db.set_state("tune_ack", True) # Legacy name
            else:
                db.set_state("modbus_plc_synced", False)

            # HR101: PLC Heartbeat
            plc_heartbeat = plc_data[1]
            if plc_heartbeat != last_plc_heartbeat:
                # Heartbeat changed, PLC is alive
                db.set_state("modbus_plc_last_seen", time.time())
                last_plc_heartbeat = plc_heartbeat

            # HR102-103: MV Feedback
            mv_feedback = struct.unpack(">f", struct.pack(">HH", plc_data[2], plc_data[3]))[0]
            db.set_state("mv", mv_feedback)
            
            # HR104: Tune Done
            tune_done_flag = plc_data[4]
            if tune_done_flag == 1:
                 # Read Tuned PID Params
                 pid_pb_out = struct.unpack(">f", struct.pack(">HH", plc_data[5], plc_data[6]))[0]
                 pid_ti_out = struct.unpack(">f", struct.pack(">HH", plc_data[7], plc_data[8]))[0]
                 pid_td_out = struct.unpack(">f", struct.pack(">HH", plc_data[9], plc_data[10]))[0]
                 
                 # Update DB with new PID
                 db.set_state("pid_pb", pid_pb_out)
                 db.set_state("pid_ti", pid_ti_out)
                 db.set_state("pid_td", pid_td_out)
                 
                 # Signal UI that tuning is done
                 db.set_state("tune_done", True) 
                 db.set_state("tune_status", 0) # Reset command to 0 automatically
                 
                 # Note: On next loop, tune_cmd will be 0, so PLC should see it and reset tune_done.
                 
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
