# temp_reading.py
# Sensor loop for MAX31865 and MAX31855, logs PV and MV to shared memory

import time
from shared_data import data
from src.sensors import MAX31865, MAX31855  # Sensor driver classes

BUFFER_LENGTH = int(30 * 60 / 2)  # 30 minutes @ 2-second sampling = 900 points

def log_trend_point():
    rtd = data.get("rtd_temp", 0.0)
    thermo = data.get("thermo_temp", 0.0)
    mv = data.get("mv", 0.0)
    timestamp = time.strftime("%H:%M:%S")

    # Select PV based on control source
    pv = rtd if data.get("pv_source", "rtd") == "rtd" else thermo

    # Append trend point
    new_point = {"time": timestamp, "pv": round(pv, 3), "mv": round(mv, 3)}

    trend = list(data["trend"])  # Convert manager.list to a normal list

    trend.append(new_point)
    if len(trend) > BUFFER_LENGTH:
        trend.pop(0)  # Trim oldest entry

    data["trend"] = trend  # Replace with updated list


def main():
    rtd_sensor = MAX31865(cs_pin="PC7")
    thermo_sensor = MAX31855(cs_pin="PC10")

    try:
        while True:
            # Read sensors
            rtd_temp = rtd_sensor.read_temperature()
            t_temp, i_temp, fault, _, _, _ = thermo_sensor.read_temp()

            # Save to shared memory
            data["rtd_temp"] = rtd_temp
            data["thermo_temp"] = t_temp
            data["internal_temp"] = i_temp
            data["fault"] = fault
            data["last_update"] = time.strftime("%Y-%m-%d %H:%M:%S")

            # Log PV + MV to trend buffer
            log_trend_point()

            time.sleep(2)

    except KeyboardInterrupt:
        print("Sensor loop stopped.")

    finally:
        rtd_sensor.close()
        thermo_sensor.close()

if __name__ == "__main__":
    main()
