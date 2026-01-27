# temp_reading.py
# Sensor loop for MAX31865, logs PV and MV to SQLite

import time
from database import db
from src.sensors import MAX31865
import config

PROBE_INTERVAL = 60 # Prune every 60 seconds

def log_trend_point():
    try:
        rtd = db.get_state("rtd_temp", 0.0)
        # mv/sp might be None in DB, default to 0.0
        mv = db.get_state("mv", 0.0)
        setpoint = db.get_state("setpoint", 0.0)
        
        # Log to SQLite
        db.log_trend(pv=rtd, sp=setpoint, mv=mv)
        
    except Exception as e:
        print(f"Error logging trend: {e}")

def main():
    # Use CS pin from config
    rtd_sensor = MAX31865(cs_pin=config.RTD_CS_PIN)
    last_prune = 0
    
    try:
        while True:
            # Read sensors
            rtd_temp = rtd_sensor.read_temperature()
            
            # Save to SQLite
            db.set_state("rtd_temp", rtd_temp)
            db.set_state("last_update", time.strftime("%Y-%m-%d %H:%M:%S"))
            db.set_state("last_update_ts", time.time())
            
            # Log PV + MV to trend buffer
            log_trend_point()

            # Prune old data periodically
            now = time.time()
            if now - last_prune > PROBE_INTERVAL:
                db.prune_trend(keep_seconds=3600)
                last_prune = now

            time.sleep(config.SENSOR_SAMPLE_INTERVAL)

    except KeyboardInterrupt:
        print("Sensor loop stopped.")

    finally:
        rtd_sensor.close()

if __name__ == "__main__":
    main()
