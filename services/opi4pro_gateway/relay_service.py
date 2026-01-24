
import time
from shared_data import data
import esp32_client

def main():
    print("🔁 Starting Relay Keepalive Service...")
    
    while True:
        try:
            # 1. Poll Status (Keepalive)
            status = esp32_client.get_status()
            
            if status:
                data["esp32_connected"] = True
                data["esp32_last_seen"] = time.time()
                data["relay_actual"] = status.get("relay", False)
                
                # 2. Consistency Check
                desired = bool(data.get("power_on", 0))
                actual = bool(status.get("relay", False))
                
                if desired != actual:
                    print(f"⚠️ State Mismatch! Desired: {desired}, Actual: {actual}. Resending command...")
                    esp32_client.set_relay(desired)
            
            else:
                data["esp32_connected"] = False
                # If disconnected, we can't do much but retry
        
        except Exception as e:
            print(f"❌ Relay Service Error: {e}")
            data["esp32_connected"] = False
        
        time.sleep(2.0) # Poll every 2 seconds (well within 15s failsafe)

if __name__ == "__main__":
    main()
