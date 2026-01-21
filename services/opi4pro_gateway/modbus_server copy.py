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
    hr=ModbusSequentialDataBlock(0, [0]*20),
    ir=ModbusSequentialDataBlock(0, [0]*20),  # Input Registers (function code 0x04)
)
context = ModbusServerContext(slaves=store, single=True)

def update_modbus_registers():
    """Reads shared_data and updates Modbus Input Registers every second."""
    last_print_time = 0  # <-- ADD THIS
    while True:
        try:
            # Safely get values from shared memory
            tc = shared_data.data.get("thermo_temp", 0.0) or 0.0
            setpoint = shared_data.data.get("setpoint", 0.0) or 0.0 #setpoint send to PLC during manual mode
            rtd = shared_data.data.get("rtd_temp", 0.0) or 0.0
            mv_manual = shared_data.data.get("mv_manual", 0.0) or 0.0 #mv send to PLC during auto mode

            # Web PLC and Mode status
            web_status  = 1 if shared_data.data.get("web",  False) else 0
            mode_status = 1 if shared_data.data.get("mode", False) else 0
            plc_status  = 1 if shared_data.data.get("plc",  False) else 0


            # Pack each float into 2 x 16-bit registers
            packed_tc = struct.pack(">f", tc)
            reg0, reg1 = struct.unpack(">HH", packed_tc)

            packed_setpoint = struct.pack(">f", setpoint)
            reg2, reg3 = struct.unpack(">HH", packed_setpoint)

            packed_rtd = struct.pack(">f", rtd)
            reg4, reg5 = struct.unpack(">HH", packed_rtd)

            # Mode & PLC status into single registers
            reg6 = mode_status
            reg7 = plc_status
            reg8 = web_status

            packed_mv_manual = struct.pack(">f", mv_manual)
            reg9, reg10 = struct.unpack(">HH", packed_mv_manual)


            
            # Update Modbus Input Registers (IR)
            store.setValues(4, 0, [reg0, reg1, reg2, reg3, reg4, reg5, reg6, reg7, reg8, reg9, reg10])


             # === Read Holding Registers (HRs) ===
            hr_values = store.getValues(3, 10, count=4)  # HR10, HR11, HR12, HR13

            sensor_select = hr_values[0]  # 0 or 1

            mv_regs = hr_values[2:4]  # [HR12, HR13]
            # Combine two 16-bit registers into a 32-bit signed int (big-endian)
            # HR12 = (most significant bits)
            # HR13 = (least significant bits)
            combined = (mv_regs[0] << 16) | mv_regs[1]  #  HR12 is high H13 is low

            # Convert to signed 32-bit integer
            if combined >= 0x80000000:
                combined -= 0x100000000

            # Scale back to float with 2 decimal places
            mv = combined / 100.0

            # Update shared data
            shared_data.data["sensor_select"] = sensor_select
            shared_data.data["mv"] = mv

            # Update pv_source based on sensor_select ===
            if sensor_select == 0:
                shared_data.data["pv_source"] = "thermo"
            else:
                shared_data.data["pv_source"] = "rtd"

            # # Log every 5 seconds 
            # now = time.time()
            # if now - last_print_time > 2:
            #     logger.info(f"RTD Temp: {rtd:.2f}°C -> {reg4}, {reg5}")
            #     logger.info(f"Received from NJ301: power_on = {bool(power_on_word)}, sensor_select = {sensor_select}")
            #     logger.info(f"Raw HR12: {mv_regs[0]}, HR13: {mv_regs[1]}")
            #     # logger.info(f"Received MV from NJ301: {mv:.2f}")
            #     # logger.info(f"PV Source selected: {shared_data.data['pv_source']}")          
            #     last_print_time = now

        except Exception as e:
            logger.error(f"Error updating Modbus registers: {e}")
            time.sleep(1)  # Prevent CPU 100%

        time.sleep(1)  # Normal 1 second loop


def main():
    identity = ModbusDeviceIdentification()
    identity.VendorName = "OrangePi"
    identity.ProductCode = "MAX318xx"
    identity.ProductName = "Modbus Temp Server"
    identity.ModelName = "OPI-TEMP"
    identity.MajorMinorRevision = "1.0"

    # Start update thread
    threading.Thread(target=update_modbus_registers, daemon=True).start()

    # Run Modbus TCP server
    logger.info("Starting Modbus TCP Server at 0.0.0.0:1502")
    StartTcpServer(context, identity=identity, address=("0.0.0.0", 1502))


if __name__ == "__main__":
    main()
