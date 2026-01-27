# relay_service.py
# Polls ESP32 and syncs state with SQLite

import time
from database import db
import esp32_client
import config

def main():
    print("🔁 Starting Relay Keepalive Service...")
    
    while True:
        try:
            # 1. Poll Status (Keepalive)
            status = esp32_client.get_status()
            
            if status:
                db.set_state("esp32_connected", True)
                db.set_state("esp32_last_seen", time.time())
                db.set_state("relay_actual", status.get("relay", False))
                
                # 2. Consistency Check
                desired = bool(db.get_state("power_on", 0))
                actual = bool(status.get("relay", False))
                
                if desired != actual:
                    print(f"⚠️ State Mismatch! Desired: {desired}, Actual: {actual}. Resending command...")
                    esp32_client.set_relay(desired)
            
            else:
                db.set_state("esp32_connected", False)
        
        except Exception as e:
            print(f"❌ Relay Service Error: {e}")
            db.set_state("esp32_connected", False)
        
        time.sleep(config.RELAY_POLL_INTERVAL)

if __name__ == "__main__":
    main()
