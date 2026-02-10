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
    
    # Initialize state variables
    gw_tx_seq = db.get_state("gw_tx_seq", 0)
    last_snapshot = None

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

            # --- 1) WRITE GW -> PLC : HR0..HR16 (17 regs) ---
            # Retrieve latest state from DB
            gw_tx_seq = db.get_state("gw_tx_seq", 0) # Reload in case it changed externally, though main source is here.
            
            web_status = int(db.get_state("web", 0))
            mode       = int(db.get_state("mode", 0))
            plc_status = int(db.get_state("plc_status", 0))

            rtd_temp   = float(db.get_state("rtd_temp", 0.0)) # Note: Used to be read from PLC, now seems Gateway sends it? 
            # WAIT: MODBUS_MAP says HR1-2 is rtd_temp (Process Temperature). 
            # Usually Process Temp comes FROM PLC.
            # But the map says "Block 1: Gateway to PLC (Read by PLC)" contains HR1-2 `rtd_temp`.
            # This implies the Gateway is simulating the process or forwarding it from elsewhere?
            # User snippet includes: write_payload.extend(float_to_registers(rtd_temp))
            # So I will follow the snippet.

            mv_manual  = float(db.get_state("mv_manual", 0.0))

            setpoint   = float(db.get_state("setpoint", 0.0))
            tune_cmd   = int(db.get_state("tune_status", 0))

            pid_pb = float(db.get_state("pid_pb", 0.0))
            pid_ti = float(db.get_state("pid_ti", 0.0))
            pid_td = float(db.get_state("pid_td", 0.0))

            # increment seq only when anything changes
            # We construct snapshot from the VALUES we are about to write (excluding seq itself)
            # Note: rtd_temp is in the snapshot in user snippet.
            snapshot = (web_status, mode, plc_status, rtd_temp, mv_manual, setpoint, tune_cmd, pid_pb, pid_ti, pid_td)
            
            if snapshot != last_snapshot:
                gw_tx_seq = (gw_tx_seq + 1) & 0xFFFF
                db.set_state("gw_tx_seq", gw_tx_seq)
                last_snapshot = snapshot

            write_payload = []
            write_payload.append(gw_tx_seq)                         # HR0
            write_payload.extend(float_to_registers(rtd_temp))      # HR1-2
            write_payload.append(web_status)                        # HR3
            write_payload.append(mode)                              # HR4
            write_payload.append(plc_status)                        # HR5
            write_payload.extend(float_to_registers(mv_manual))     # HR6-7
            write_payload.extend(float_to_registers(setpoint))      # HR8-9
            write_payload.append(tune_cmd)                          # HR10
            write_payload.extend(float_to_registers(pid_pb))        # HR11-12
            write_payload.extend(float_to_registers(pid_ti))        # HR13-14
            write_payload.extend(float_to_registers(pid_td))        # HR15-16

            wr = client.write_registers(0, write_payload, unit=1)
            if wr.isError():
                logger.error(f"Write Error: {wr}")

            # --- 2) READ PLC -> GW : HR100..HR110 (11 regs) ---
            rr = client.read_holding_registers(100, 11, unit=1)
            if not rr.isError():
                regs = rr.registers

                ack_seq   = regs[0]                 # HR100
                heartbeat = regs[1]                 # HR101
                mv_fb     = registers_to_float(regs[2:4])   # HR102-103
                tune_done = regs[4]                 # HR104
                pb_out    = registers_to_float(regs[5:7])   # HR105-106
                ti_out    = registers_to_float(regs[7:9])   # HR107-108
                td_out    = registers_to_float(regs[9:11])  # HR109-110

                db.set_state("mv", mv_fb)
                db.set_state("tune_done", bool(tune_done))
                db.set_state("pid_pb_out", pb_out)
                db.set_state("pid_ti_out", ti_out)
                db.set_state("pid_td_out", td_out)

                db.set_state("modbus_plc_last_seen", time.time())
                db.set_state("modbus_last_tick_ts", time.time())
                
                # Check synchronization
                is_synced = (ack_seq == gw_tx_seq)
                db.set_state("modbus_plc_synced", is_synced)
                
            else:
                logger.error(f"Read Error (HR100..110): {rr}")
                
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
