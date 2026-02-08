# service_modbus.py
# NOW ACTING AS CLIENT (MASTER)

import struct
import time
import logging
import logging.handlers

from pymodbus.client.sync import ModbusTcpClient
from pymodbus.payload import BinaryPayloadBuilder, BinaryPayloadDecoder
from pymodbus.constants import Endian

from database import db  # SQLite wrapper
import config

# Setup logger
logger = logging.getLogger("modbus_client")
logger.setLevel(config.LOG_LEVEL)
logger.propagate = False

if not logger.handlers:
    fmt = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(fmt)
    logger.addHandler(console_handler)
    
    if config.LOG_TO_FILE:
        try:
            file_handler = logging.handlers.RotatingFileHandler(
                config.MODBUS_LOG_FILE, maxBytes=5*1024*1024, backupCount=3
            )
            file_handler.setFormatter(fmt)
            logger.addHandler(file_handler)
        except Exception:
            pass

def float_to_registers(f):
    builder = BinaryPayloadBuilder(byteorder=Endian.Big, wordorder=Endian.Big)
    builder.add_32bit_float(f)
    return builder.to_registers()

def registers_to_float(regs):
    decoder = BinaryPayloadDecoder.fromRegisters(regs, byteorder=Endian.Big, wordorder=Endian.Big)
    return decoder.decode_32bit_float()

def modbus_loop():
    client = ModbusTcpClient(config.PLC_IP, port=config.PLC_PORT, timeout=config.MODBUS_TIMEOUT)
    
    last_connection_attempt = 0
    
    while True:
        try:
            # Connection Logic
            if not client.is_socket_open():
                current_time = time.time()
                if current_time - last_connection_attempt > 5.0:
                    logger.info(f"Connecting to PLC at {config.PLC_IP}:{config.PLC_PORT}...")
                    if client.connect():
                        logger.info("Connected to PLC.")
                        db.set_state("modbus_plc_synced", True)
                    else:
                        logger.error("Failed to connect to PLC.")
                        db.set_state("modbus_plc_synced", False)
                    last_connection_attempt = current_time
                    
            if not client.is_socket_open():
                time.sleep(1)
                continue

            # --- 1. WRITE COMMANDS (Gateway -> PLC) ---
            # HR8-9: Setpoint
            # HR10: Tune Cmd
            # HR11-16: PID Params
            
            # Read current desired state from DB
            setpoint = db.get_state("setpoint", 0.0)
            tune_cmd = db.get_state("tune_status", 0) # 1=Start, 0=Stop
            pid_pb = db.get_state("pid_pb", 0.0)
            pid_ti = db.get_state("pid_ti", 0.0)
            pid_td = db.get_state("pid_td", 0.0)
            
            # Pack data
            write_payload = []
            write_payload.extend(float_to_registers(setpoint)) # HR8-9
            write_payload.append(tune_cmd)                     # HR10
            write_payload.extend(float_to_registers(pid_pb))   # HR11-12
            write_payload.extend(float_to_registers(pid_ti))   # HR13-14
            write_payload.extend(float_to_registers(pid_td))   # HR15-16

            # Write to HR8 (Start address)
            # HR8 is the start. Length is 2+1+2+2+2 = 9 registers
            try:
                write_req = client.write_registers(8, write_payload, unit=1)
                if write_req.isError():
                    logger.error(f"Write Error: {write_req}")
            except Exception as e:
                logger.error(f"Write Exception: {e}")

            # --- 2. READ STATUS (PLC -> Gateway) ---
            # We read two blocks or one big block. 
            # Block 1: HR0 - HR7 (8 regs)
            # Block 2: HR100 - HR101 (2 regs)
            
            # Reading Block 1 (HR0 - HR7)
            # HR0: Seq (Heartbeat)
            # HR1-2: RTD
            # HR3: Web Status
            # HR4: Mode
            # HR5: PLC Status
            # HR6-7: Manual MV Feedback
            
            rr1 = client.read_holding_registers(0, 8, unit=1)
            
            if not rr1.isError():
                regs1 = rr1.registers
                
                # Decode
                seq_num = regs1[0] # HR0
                rtd_temp = registers_to_float(regs1[1:3]) # HR1-2
                web_status = regs1[3] # HR3
                mode = regs1[4]       # HR4
                plc_status = regs1[5] # HR5
                manual_mv = registers_to_float(regs1[6:8]) # HR6-7
                
                # Update DB
                db.set_state("rtd_temp", rtd_temp)
                db.set_state("modbus_last_tick_ts", time.time()) # Updates heartbeat
                
                # Optional: Sync mode/status back to DB if PLC is authority
                # db.set_state("mode", mode) 
                
            else:
                logger.error(f"Read Error Block 1: {rr1}")

            # Reading Block 2 (HR100 - HR101) - Current MV
            rr2 = client.read_holding_registers(100, 2, unit=1)
            if not rr2.isError():
                regs2 = rr2.registers
                current_mv = registers_to_float(regs2[0:2])
                db.set_state("mv", current_mv)
            else:
                logger.warning(f"Read Error Block 2: {rr2}")

            # Update loop speed
            time.sleep(config.MODBUS_UPDATE_INTERVAL)
            
        except Exception as e:
            logger.error(f"Main loop error: {e}")
            client.close()
            time.sleep(1)

def main():
    logger.info("Starting Modbus TCP Client Service...")
    modbus_loop()

if __name__ == "__main__":
    main()
