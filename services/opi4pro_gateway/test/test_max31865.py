#!/usr/bin/env python3
"""
Test script for MAX31865 RTD sensor connected to Orange Pi 4 Pro
- SPI Bus: 3
- Device: 0 (/dev/spidev3.0)
- CS Pin: wPi 13 (PD23, physical pin 22)
"""

import sys
import os
import time

# Add parent directory to path so we can import src.sensors
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.sensors import MAX31865

def main():
    print("=" * 60)
    print("MAX31865 RTD Sensor Test")
    print("=" * 60)
    print("SPI Bus: 3")
    print("SPI Device: 0 (/dev/spidev3.0)")
    print("CS Pin: wPi 13 (PD23, physical pin 22)")
    print("=" * 60)
    
    try:
        # Initialize MAX31865 sensor
        print("\n🔌 Initializing MAX31865...")
        sensor = MAX31865(spi_bus=3, spi_device=0, cs_pin=13)
        print("✓ MAX31865 initialized successfully")
        
        # Read temperature multiple times
        print("\n📊 Reading temperatures (10 samples, 1 second interval)...")
        print("-" * 60)
        
        temps = []
        for i in range(10):
            try:
                temp = sensor.read_temperature()
                temps.append(temp)
                print(f"[{i+1:2d}] Temperature: {temp:.2f} °C")
                time.sleep(1)
            except Exception as e:
                print(f"[{i+1:2d}] ❌ Error reading temperature: {e}")
                continue
        
        # Statistics
        if temps:
            print("-" * 60)
            print(f"\n📈 Statistics:")
            print(f"  Min:     {min(temps):.2f} °C")
            print(f"  Max:     {max(temps):.2f} °C")
            print(f"  Average: {sum(temps)/len(temps):.2f} °C")
            print(f"  Samples: {len(temps)}/10")
            print("\n✓ Test completed successfully!")
        else:
            print("\n❌ No valid readings obtained")
        
        # Cleanup
        sensor.close()
        print("\n✓ Sensor closed")
        
    except FileNotFoundError as e:
        print(f"\n❌ SPI device not found: {e}")
        print("   Make sure SPI is enabled and you're running with sudo:")
        print("   sudo python3 test/test_max31865.py")
    except PermissionError as e:
        print(f"\n❌ Permission denied: {e}")
        print("   Run with sudo: sudo python3 test/test_max31865.py")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
