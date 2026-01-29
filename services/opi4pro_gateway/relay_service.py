# relay_service.py
# Polls ESP32 and syncs state with SQLite

import time
from database import db
import esp32_client
import config

def main():
    print("🔁 Starting Relay Keepalive Service...")
    
    last_sync_time = 0  # Track last time we synced to avoid rapid re-commands
    MIN_SYNC_INTERVAL = 0.5  # Minimum time between sync attempts (seconds)
    
    while True:
        try:
            # 1. Poll Status (Keepalive)
            status = esp32_client.get_status()
            
            if status:
                db.set_state("esp32_connected", True)
                db.set_state("esp32_last_seen", time.time())
                db.set_state("relay_actual", status.get("relay", False))
                
                # 2. Consistency Check - with debouncing to prevent rapid re-commands
                val_raw = db.get_state("power_on", 0)
                try:
                    desired = int(val_raw) == 1
                except (ValueError, TypeError):
                    desired = False

                actual = bool(status.get("relay", False))
                
                print(f"[DEBUG] Raw: {val_raw} | Desired: {desired} | Actual: {actual}")

                # Only attempt to sync if states differ AND enough time has passed
                current_time = time.time()
                if desired != actual:
                    if current_time - last_sync_time >= MIN_SYNC_INTERVAL:
                        print(f"⚠️ State Mismatch! Desired: {desired}, Actual: {actual}. Resending command...")
                        esp32_client.set_relay(desired)
                        last_sync_time = current_time
                    else:
                        print(f"⏳ State mismatch detected, but debouncing sync (waited {current_time - last_sync_time:.1f}s)")
            
            else:
                db.set_state("esp32_connected", False)
        
        except Exception as e:
            print(f"❌ Relay Service Error: {e}")
            db.set_state("esp32_connected", False)
        
        time.sleep(config.RELAY_POLL_INTERVAL)

if __name__ == "__main__":
    main()
