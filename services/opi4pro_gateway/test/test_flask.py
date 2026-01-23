#!/usr/bin/env python3
"""
Test Flask server locally with LED control + Heartbeat monitoring
This demonstrates:
1. LED on/off control (POST requests)
2. Heartbeat endpoint (GET requests)
3. How browser can detect gateway status
"""

import requests
import time
import threading
from datetime import datetime

# Flask server address
FLASK_URL = "http://192.168.8.134:5000"

# Heartbeat configuration
HEARTBEAT_TIMEOUT = 10  # seconds
HEARTBEAT_INTERVAL = 2  # seconds
last_heartbeat = time.time()
gateway_alive = False


def print_status(message, status="INFO"):
    """Print timestamped message"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    prefix = {
        "INFO": "ℹ️ ",
        "OK": "✓ ",
        "ERROR": "✗ ",
        "HEARTBEAT": "💓",
        "DEAD": "💀"
    }
    print(f"[{timestamp}] {prefix.get(status, '')} {message}")


def test_led_on():
    """Test: Turn LED ON"""
    try:
        print_status("Sending: POST /light/on")
        response = requests.post(f"{FLASK_URL}/light/on", timeout=2)
        if response.status_code == 200:
            data = response.json()
            print_status(f"LED ON - Response: {data}", "OK")
            return True
        else:
            print_status(f"Failed: Status {response.status_code}", "ERROR")
            return False
    except Exception as e:
        print_status(f"Error turning LED on: {e}", "ERROR")
        return False


def test_led_off():
    """Test: Turn LED OFF"""
    try:
        print_status("Sending: POST /light/off")
        response = requests.post(f"{FLASK_URL}/light/off", timeout=2)
        if response.status_code == 200:
            data = response.json()
            print_status(f"LED OFF - Response: {data}", "OK")
            return True
        else:
            print_status(f"Failed: Status {response.status_code}", "ERROR")
            return False
    except Exception as e:
        print_status(f"Error turning LED off: {e}", "ERROR")
        return False


def test_control_status():
    """Test: Get control status"""
    try:
        print_status("Sending: GET /control_status")
        response = requests.get(f"{FLASK_URL}/control_status", timeout=2)
        if response.status_code == 200:
            data = response.json()
            print_status(f"Control Status: light={data.get('light')}, plc={data.get('plc')}, mode={data.get('mode')}", "OK")
            return data
        else:
            print_status(f"Failed: Status {response.status_code}", "ERROR")
            return None
    except Exception as e:
        print_status(f"Error getting control status: {e}", "ERROR")
        return None


def poll_heartbeat():
    """Continuously poll heartbeat endpoint (simulates browser)"""
    global last_heartbeat, gateway_alive
    
    print_status("Heartbeat monitor started (polling every 2 seconds)", "HEARTBEAT")
    
    while True:
        try:
            response = requests.get(f"{FLASK_URL}/heartbeat", timeout=2)
            if response.status_code == 200:
                data = response.json()
                last_heartbeat = time.time()
                
                if not gateway_alive:
                    gateway_alive = True
                    print_status("Gateway ONLINE ✓", "OK")
                
                print_status(f"Heartbeat received: {data.get('status')} at {data.get('timestamp'):.2f}", "HEARTBEAT")
            
        except requests.exceptions.Timeout:
            print_status("Heartbeat request timeout", "ERROR")
        except requests.exceptions.ConnectionError:
            print_status("Cannot connect to Flask server", "ERROR")
            gateway_alive = False
        except Exception as e:
            print_status(f"Heartbeat error: {e}", "ERROR")
        
        time.sleep(HEARTBEAT_INTERVAL)


def monitor_gateway_status():
    """Monitor gateway status (simulates browser detecting dead gateway)"""
    global gateway_alive, last_heartbeat
    
    print_status("Gateway status monitor started", "INFO")
    
    while True:
        time.sleep(1)  # Check every second
        
        time_since_heartbeat = time.time() - last_heartbeat
        
        if time_since_heartbeat > HEARTBEAT_TIMEOUT:
            if gateway_alive:
                gateway_alive = False
                print_status(f"Gateway OFFLINE - No heartbeat for {time_since_heartbeat:.1f}s", "DEAD")
        else:
            # Gateway is alive
            if gateway_alive:
                remaining = HEARTBEAT_TIMEOUT - time_since_heartbeat
                if remaining < 3:  # Alert when close to timeout
                    print_status(f"Gateway status: ALIVE (heartbeat in {remaining:.1f}s)", "INFO")


def main():
    """Main test sequence"""
    print("\n" + "=" * 70)
    print("Flask LED Control + Heartbeat Monitoring Test")
    print("=" * 70)
    print(f"Target: {FLASK_URL}")
    print(f"Heartbeat Timeout: {HEARTBEAT_TIMEOUT}s")
    print(f"Heartbeat Interval: {HEARTBEAT_INTERVAL}s")
    print("=" * 70 + "\n")
    
    # Start heartbeat polling in background thread
    heartbeat_thread = threading.Thread(target=poll_heartbeat, daemon=True)
    heartbeat_thread.start()
    print_status("Heartbeat thread started", "INFO")
    
    # Start gateway status monitor in background thread
    status_thread = threading.Thread(target=monitor_gateway_status, daemon=True)
    status_thread.start()
    print_status("Status monitor thread started", "INFO")
    
    # Wait for first heartbeat
    time.sleep(3)
    
    # LED Control Tests
    print("\n" + "-" * 70)
    print("LED Control Tests")
    print("-" * 70)
    
    # Test 1: LED ON
    time.sleep(1)
    test_led_on()
    time.sleep(2)
    
    # Test 2: Get Status
    time.sleep(1)
    test_control_status()
    time.sleep(2)
    
    # Test 3: LED OFF
    time.sleep(1)
    test_led_off()
    time.sleep(2)
    
    # Test 4: LED ON again
    time.sleep(1)
    test_led_on()
    time.sleep(2)
    
    # Keep monitoring
    print("\n" + "-" * 70)
    print("Continuous Monitoring (Ctrl+C to stop)")
    print("-" * 70 + "\n")
    
    try:
        while True:
            time.sleep(5)
            test_control_status()
    except KeyboardInterrupt:
        print("\n" + "=" * 70)
        print_status("Test terminated by user", "INFO")
        print("=" * 70)
        exit(0)


if __name__ == "__main__":
    main()
