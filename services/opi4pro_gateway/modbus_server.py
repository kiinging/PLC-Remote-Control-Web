# modbus_server.py

import struct
import time
import threading
import logging

from pymodbus.server import StartTcpServer
from pymodbus.datastore import ModbusSequentialDataBlock, ModbusSlaveContext, ModbusServerContext
from pymodbus.device import ModbusDeviceIdentification
import shared_data

# Setup logger
logger = logging.getLogger("modbus_server")
logger.setLevel(logging.INFO)

file_handler = logging.FileHandler('/home/orangepi/projects/flask/mv_log.txt')
file_formatter = logging.Formatter('%(asctime)s - %(message)s')
file_handler.setFormatter(file_formatter)
logger.addHandler(file_handler)

# Modbus data store
store = ModbusSlaveContext(
    di=ModbusSequentialDataBlock(0, [0]*10),
    co=ModbusSequentialDataBlock(0, [0]*10),
    hr=ModbusSequentialDataBlock(0, [0]*30),
    ir=ModbusSequentialDataBlock(0, [0]*20),  # Input Registers (function code 0x04)
)
context = ModbusServerContext(slaves=store, single=True)

def update_modbus_registers():
    """Reads shared_data and updates Modbus Input Registers every second."""
    last_print_time = 0  # <-- ADD THIS
    while True:
        try:
            # Update modbus loop tick timestamp for heartbeat monitoring
            shared_data.data["modbus_last_tick_ts"] = time.time()
            
            # Safely get values from shared memory
            tc = shared_data.data.get("thermo_temp", 0.0) or 0.0
            rtd = shared_data.data.get("rtd_temp", 0.0) or 0.0
#            mv_manual = shared_data.data.get("mv_manual", 0.0) or 0.0 #mv send to PLC during auto mode

            # Web PLC and Mode status
            web_status  = 1 if shared_data.data.get("web",  False) else 0
            mode_status = shared_data.data.get("mode", 0)
            plc_status  = 1 if shared_data.data.get("plc",  False) else 0

            # Pack each float into 2 x 16-bit registers
            packed_tc = struct.pack(">f", tc)
            reg0, reg1 = struct.unpack(">HH", packed_tc)

            packed_rtd = struct.pack(">f", rtd)
            reg2, reg3 = struct.unpack(">HH", packed_rtd)

            # Mode & PLC status into single registers
            reg4 = mode_status
            reg5 = plc_status
            reg6 = web_status

            # packed_mv_manual = struct.pack(">f", mv_manual)
            # reg7, reg8 = struct.unpack(">HH", packed_mv_manual)

            # Update Modbus Holding Registers (HR0..HR10)
            store.setValues(3, 0, [reg0, reg1, reg2, reg3, reg4, reg5, reg6]) # HR0..HR6

            # --- Manual MV Handshake Logic (HR7-HR9) ---
            if shared_data.data.get("mv_manual_update_pending", False):
                mv_value = shared_data.data.get("mv_manual", 0.0)
                mv0, mv1 = struct.unpack(">HH", struct.pack(">f", mv_value))

                # HR7 = handshake flag (1)
                store.setValues(3, 7, [1, mv0, mv1])  # HR7–HR9

                shared_data.data["mv_manual_update_pending"] = False


            # --- PID Handshake Logic (HR10-HR16) ---
            if shared_data.data.get("pid_update_pending", False):
                # ✅ Read flat keys instead of dictionary
                pb = shared_data.data.get("pid_pb", 0.0)
                ti = shared_data.data.get("pid_ti", 0.0)
                td = shared_data.data.get("pid_td", 0.0)

                # Pack as floats → 2x16-bit registers each
                pb0, pb1 = struct.unpack(">HH", struct.pack(">f", pb))
                ti0, ti1 = struct.unpack(">HH", struct.pack(">f", ti))
                td0, td1 = struct.unpack(">HH", struct.pack(">f", td))

                # Write into Modbus Holding Registers HR10–HR16
                # HR0 is trigger flag, set to 1 when new data is written
                store.setValues(3, 10, [1, pb0, pb1, ti0, ti1, td0, td1])

                shared_data.data["pid_update_pending"] = False
            
            # --- Setpoint Handshake Logic (HR17-HR19) ---
            if shared_data.data.get("setpoint_update_pending", False):
                # Prepare float setpoint for HR18–HR19
                sp = shared_data.data.get("setpoint", 0.0)
                sp0, sp1 = struct.unpack(">HH", struct.pack(">f", sp))

                # HR18 = handshake flag (set to 1)
                store.setValues(3, 17, [1])          # HR17 handshake flag = 1
                store.setValues(3, 18, [sp0, sp1])   # HR18–HR19 for value

                shared_data.data["setpoint_update_pending"] = False

            # --- Tune Setpoint Handshake (HR24 + HR18–HR19 reuse) ---
            if shared_data.data.get("tune_setpoint_update_pending", False):
                tune_sp = shared_data.data.get("tune_setpoint", 0.0)
                sp0, sp1 = struct.unpack(">HH", struct.pack(">f", tune_sp))

                store.setValues(3, 24, [1])          # HR24 flag = 1
                store.setValues(3, 18, [sp0, sp1])   # HR18–HR19 reused for setpoint

                shared_data.data["tune_setpoint_update_pending"] = False

            # --- Tune Start Handshake (HR25) ---
            if shared_data.data.get("tune_start_pending", False):
                store.setValues(3, 25, [1])          # HR25 = 1
                shared_data.data["tune_start_pending"] = False
                shared_data.data["tune_completed"] = False

            # --- Tune Stop Handshake (HR26) ---
            if shared_data.data.get("tune_stop_pending", False):
                store.setValues(3, 26, [1])          # HR26 = 1
                shared_data.data["tune_stop_pending"] = False
                shared_data.data["tune_in_progress"] = False

  
            # --- Read back HRs from PLC (acknowledge) ---
            hr_values = store.getValues(3, 0, count=31)  # Read HR10–HR30
            # hr_values[7] → HR7 : Trigger flag for Manual MV update
            # hr_values[8-9] → HR8-9 : mv_manual
            # hr_values[10] → HR10 : Trigger flag for PID update
            # hr_values[11 -12 ] → HR11-12 : PB
            # hr_values[13 -14 ] → HR13-14 : TI
            # hr_values[15 -16 ] → HR15-16 : TD
            # hr_values[17] → HR17 : Trigger flag for Setpoint update
            # hr_values[18-19] → HR18-19 : setpoint
            # hr_values[21] → HR21 : power_on
            # hr_values[22-23] → HR22 -23 : mv
            # hr_values[25] → HR25 : Trigger flag for Tuning Setpoint update
            # hr_values[26] → HR26 : Trigger flag for Tuning Stop

            # Manual MV ack (HR7)
            hr7_val = hr_values[7]  # HR7 is offset from HR10
            if hr7_val == 0 and not shared_data.data.get("mv_manual_acknowledged", False):
                shared_data.data["mv_manual_acknowledged"] = True

            # PID ack
            hr10_val = hr_values[10]  # HR10
            if hr10_val == 0 and not shared_data.data.get("pid_acknowledged", False):
                shared_data.data["pid_acknowledged"] = True

            # Setpoint ack
            hr17_val = hr_values[17]  # HR17 (offset from HR10)
            if hr17_val == 0 and not shared_data.data.get("setpoint_acknowledged", False):
                shared_data.data["setpoint_acknowledged"] = True

              # --- Tune Setpoint Ack (HR24) ---
            hr24_val = hr_values[24]
            if hr24_val == 0 and not shared_data.data.get("tune_setpoint_acknowledged", False):
                shared_data.data["tune_setpoint_acknowledged"] = True

            # --- Tune Start Ack (HR25) ---
            hr25_val = hr_values[25]
            if hr25_val == 0 and not shared_data.data.get("tune_start_acknowledged", False):
                shared_data.data["tune_start_acknowledged"] = True
                shared_data.data["tune_in_progress"] = True  
                # Still keep tune_in_progress = True until PLC signals done

            # --- Tune Stop Ack (HR26) ---
            hr26_val = hr_values[26]
            if hr26_val == 0 and not shared_data.data.get("tune_stop_acknowledged", False):
                shared_data.data["tune_stop_acknowledged"] = True
                shared_data.data["tune_in_progress"] = False

            # Detect completion (HR27)
            hr27_val = hr_values[27]
            if hr27_val == 1 and not shared_data.data.get("tune_completed", False):
                # Read new PB, Ti, Td from HR11–HR16
                pb_raw = struct.pack(">HH", hr_values[11], hr_values[12])
                ti_raw = struct.pack(">HH", hr_values[13], hr_values[14])
                td_raw = struct.pack(">HH", hr_values[15], hr_values[16])
                pb = struct.unpack(">f", pb_raw)[0]
                ti = struct.unpack(">f", ti_raw)[0]
                td = struct.unpack(">f", td_raw)[0]

                shared_data.data["pid_pb"] = pb
                shared_data.data["pid_ti"] = ti
                shared_data.data["pid_td"] = td

                # Mark states
                shared_data.data["tune_in_progress"] = False
                shared_data.data["tune_completed"] = True

                # Reset HR27 to 0 (optional)
                store.setValues(3, 27, [0])

            sensor_select = hr_values[20]  # 0 or 1
            power_on      = hr_values[21]  # 0 or 1

            # Extract MV registers (HR22, HR23)
            packed_mv = struct.pack(">HH", hr_values[22], hr_values[23])
            mv = struct.unpack(">f", packed_mv)[0]  # MV from PLC

            # Update shared data
            shared_data.data["sensor_select"] = sensor_select
            shared_data.data["power_on"] = power_on
            shared_data.data["mv"] = mv            
            shared_data.data["pv_source"] = "thermo" if sensor_select == 0 else "rtd"    # Update pv_source based on sensor_select ===

        except Exception as e:
            logger.error(f"Error updating Modbus registers: {e}")
            time.sleep(1)  # Prevent CPU 100%

        time.sleep(1)  # Normal 1 second loop


def main():
    identity = ModbusDeviceIdentification()
    identity.VendorName = "OrangePi"
    identity.ProductCode = "OPI-Z3"
    identity.ProductName = "Temp & Control Gateway"
    identity.ModelName = "OrangePi Zero 3 (1GB)"
    identity.MajorMinorRevision = "1.0"

    # Start update thread
    threading.Thread(target=update_modbus_registers, daemon=True).start()

    # Run Modbus TCP server
    logger.info("Starting Modbus TCP Server at 0.0.0.0:1502")
    StartTcpServer(context, identity=identity, address=("0.0.0.0", 1502))


if __name__ == "__main__":
    main()
