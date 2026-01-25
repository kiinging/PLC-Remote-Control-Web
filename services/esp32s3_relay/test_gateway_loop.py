import requests
import time
import sys

# CONFIGURATION
# ------------------------------------------------------------------
# REPLACE THIS with the IP address printed on your ESP32 Serial Monitor
ESP_IP = "192.168.8.191" 
# ------------------------------------------------------------------

URL = f"http://{ESP_IP}/relay"
STATUS_URL = f"http://{ESP_IP}/status"
API_KEY = "esp32-secret-key-123"

def test_connection():
    headers = {"X-API-Key": API_KEY}
    
    print(f"Testing connection to ESP32 at {ESP_IP}...")

    # 1. Turn ON
    print("Sending ON command...")
    try:
        res = requests.post(URL, json={"on": True}, headers=headers, timeout=5)
        print(f"Response: {res.status_code} - {res.text}")
    except Exception as e:
        print(f"Failed to connect: {e}")
        return

    time.sleep(2)

    # 2. Check Status
    print("Checking Status...")
    try:
        res = requests.get(STATUS_URL, headers=headers, timeout=5)
        print(f"Response: {res.status_code} - {res.text}")
    except Exception as e:
        print(f"Failed: {e}")

    time.sleep(2)

    # 3. Turn OFF
    print("Sending OFF command...")
    try:
        res = requests.post(URL, json={"on": False}, headers=headers, timeout=5)
        print(f"Response: {res.status_code} - {res.text}")
    except Exception as e:
        print(f"Failed: {e}")

if __name__ == "__main__":
    if ESP_IP == "192.168.8.xxx":
        print("ERROR: Please edit this script and set the correct ESP_IP!")
        sys.exit(1)
        
    while True:
        test_connection()
        print("\nWaiting 5 seconds before repeating...\n")
        time.sleep(5)
