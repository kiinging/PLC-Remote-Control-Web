#!/usr/bin/env python3
"""
Simple blink test for Orange Pi 4 Pro GPIO pin PC14 (wPi pin 21)
This script tests the LED connected to LIGHT_PIN
"""

import wiringpi
import time
import sys

# GPIO Setup
LIGHT_PIN = 10  # wPi pin 10 for physical pin 18 (PL2) on Orange Pi 4 Pro

def setup():
    """Initialize wiringpi and configure GPIO pin"""
    try:
        wiringpi.wiringPiSetup()
        wiringpi.pinMode(LIGHT_PIN, wiringpi.OUTPUT)
        print(f"✓ GPIO initialized: wPi pin {LIGHT_PIN} set as OUTPUT")
    except Exception as e:
        print(f"✗ Setup failed: {e}")
        sys.exit(1)

def blink(times=5, delay=0.5):
    """Blink the LED"""
    try:
        print(f"Blinking LED {times} times (delay: {delay}s)")
        for i in range(times):
            wiringpi.digitalWrite(LIGHT_PIN, wiringpi.HIGH)
            print(f"  [{i+1}/{times}] LED ON")
            time.sleep(delay)
            
            wiringpi.digitalWrite(LIGHT_PIN, wiringpi.LOW)
            print(f"  [{i+1}/{times}] LED OFF")
            time.sleep(delay)
        
        print("✓ Blink test completed successfully")
    except Exception as e:
        print(f"✗ Blink test failed: {e}")
        sys.exit(1)

def cleanup():
    """Set pin LOW and cleanup"""
    try:
        wiringpi.digitalWrite(LIGHT_PIN, wiringpi.LOW)
        print("✓ Cleanup complete")
    except Exception as e:
        print(f"⚠ Cleanup warning: {e}")

if __name__ == "__main__":
    print("=" * 50)
    print("Orange Pi 4 Pro - LED Blink Test")
    print("Pin: PE3 (Physical pin 21, wPi pin 12)")
    print("=" * 50)
    
    setup()
    blink(times=5, delay=0.5)
    cleanup()
