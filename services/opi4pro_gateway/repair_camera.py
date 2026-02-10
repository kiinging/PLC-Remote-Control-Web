import requests
import time
import esp32_client
import config

# Setup
RADXA_URL = f"http://{config.RADXA_IP}:{config.RADXA_PORT}"

def run_repair():
    print("🔧 STARTING MANUAL CAMERA REPAIR SEQUENCE")
    print("------------------------------------------")

    # 1. Test Shutdown API
    print(f"\n1️⃣  Testing Shutdown API at {RADXA_URL}/shutdown...")
    try:
        resp = requests.post(f"{RADXA_URL}/shutdown", timeout=3)
        print(f"   Response ({resp.status_code}): {resp.text}")
    except Exception as e:
        print(f"   ⚠️ Could not contact Radxa (might already be down?): {e}")

    # 2. Wait
    print("\n2️⃣  Waiting 30 seconds for shutdown...")
    for i in range(30, 0, -1):
        print(f"   {i}...", end="\r")
        time.sleep(1)
    print("   Done waiting.")

    # 3. Force Relay OFF
    print("\n3️⃣  Forcing Relay OFF (Hard Cut)...")
    try:
        esp32_client.set_relay(False)
        print("   ✅ Relay OFF command sent.")
    except Exception as e:
        print(f"   ❌ Failed to send Relay OFF: {e}")

    # 4. Wait for electrical discharge
    print("\n4️⃣  Waiting 10 seconds (Power Draining)...")
    time.sleep(10)

    # 5. Force Relay ON
    print("\n5️⃣  Forcing Relay ON...")
    try:
        esp32_client.set_relay(True)
        print("   ✅ Relay ON command sent.")
    except Exception as e:
        print(f"   ❌ Failed to send Relay ON: {e}")

    print("\n------------------------------------------")
    print("✅ SEQUENCE COMPLETE. Please wait ~1 minute for Radxa to boot, then check the camera.")

if __name__ == "__main__":
    run_repair()
