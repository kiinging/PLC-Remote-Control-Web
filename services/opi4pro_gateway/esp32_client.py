
import requests
import time

# Configuration
ESP32_IP = "192.168.8.196" # Replace with actual IP or hostname if known. Defaulting to a likely address for now, user needs to update.
API_KEY = "plc-secret-key-123"
TIMEOUT = 2.0  # seconds

def set_relay(on: bool):
    """
    Send POST /relay command to ESP32.
    """
    url = f"http://{ESP32_IP}/relay"
    headers = {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json"
    }
    payload = {"on": on}

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=TIMEOUT)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"ESP32 Relay request failed: {e}")
        return None

def get_status():
    """
    Send GET /status request to ESP32.
    """
    url = f"http://{ESP32_IP}/status"
    headers = {
        "X-API-Key": API_KEY
    }

    try:
        response = requests.get(url, headers=headers, timeout=TIMEOUT)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"ESP32 Status request failed: {e}")
        return None
