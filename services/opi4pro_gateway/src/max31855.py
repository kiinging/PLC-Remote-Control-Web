"""
MAX31855 Thermocouple-to-Digital Converter
- Sensor: K, J, N, T, E, R, S, B type thermocouple
- Interface: SPI (read-only)
- Platform: Orange Pi 4 Pro (SPI3)
"""

import spidev
import wiringpi


class MAX31855:
    """
    MAX31855 Thermocouple-to-Digital Converter
    
    Args:
        spi_bus (int): SPI bus number (default: 3 for Orange Pi 4 Pro)
        spi_device (int): SPI device number (default: 1)
        cs_pin (int): Chip Select pin (wPi number, default: 9)
    """
    
    def __init__(self, spi_bus=3, spi_device=1, cs_pin=9):
        """Initialize MAX31855 sensor"""
        self.cs_pin = cs_pin
        self.spi_bus = spi_bus
        self.spi_device = spi_device
        
        # Setup CS pin
        wiringpi.wiringPiSetup()
        wiringpi.pinMode(self.cs_pin, wiringpi.OUTPUT)
        wiringpi.digitalWrite(self.cs_pin, wiringpi.HIGH)
        
        # Open SPI device
        self.spi = spidev.SpiDev()
        self.spi.open(spi_bus, spi_device)
        self.spi.max_speed_hz = 5000000
        self.spi.mode = 0b00  # SPI mode 0
    
    def read_temp(self, verbose=False):
        """
        Read temperature from sensor
        
        Args:
            verbose (bool): Print debug information
            
        Returns:
            tuple: (thermocouple_temp, internal_temp, fault, open_circuit, short_gnd, short_vcc)
                - thermocouple_temp (float): Temperature from thermocouple (°C) or None if fault
                - internal_temp (float): Internal reference temperature (°C) or None if fault
                - fault (bool): Fault detected
                - open_circuit (bool): Open circuit fault
                - short_gnd (bool): Short to GND fault
                - short_vcc (bool): Short to VCC fault
        """
        # Read 4 bytes from sensor
        wiringpi.digitalWrite(self.cs_pin, wiringpi.LOW)
        raw = self.spi.readbytes(4)
        wiringpi.digitalWrite(self.cs_pin, wiringpi.HIGH)
        
        if len(raw) != 4:
            raise RuntimeError("Failed to read 4 bytes from MAX31855")
        
        if verbose:
            print("\n[ MAX31855 (Thermocouple) ]")
            print(f"Raw Bytes: {[hex(b) for b in raw]}")
        
        # Combine bytes into 32-bit value
        value = (raw[0] << 24) | (raw[1] << 16) | (raw[2] << 8) | raw[3]
        
        # Check fault bit (bit 16)
        if value & 0x00010000:
            fault = True
            open_circuit = bool(value & 0x01)
            short_gnd = bool(value & 0x02)
            short_vcc = bool(value & 0x04)
            
            if verbose:
                print("✗ FAULT DETECTED!")
                if open_circuit:
                    print("  - Open Circuit")
                if short_gnd:
                    print("  - Short to GND")
                if short_vcc:
                    print("  - Short to VCC")
            
            return None, None, fault, open_circuit, short_gnd, short_vcc
        
        # Extract internal temperature (bits 4-15)
        internal = (value >> 4) & 0x0FFF
        if value & 0x00008000:  # Sign bit
            internal -= 4096
        internal_temp = internal * 0.0625
        
        # Extract thermocouple temperature (bits 18-31)
        temp = ((value >> 18) & 0x3FFF)
        if value & 0x80000000:  # Sign bit
            temp -= 0x4000
        thermo_temp = temp * 0.25
        
        if verbose:
            print(f"Thermocouple Temp: {thermo_temp:.2f} °C")
            print(f"Internal Temp    : {internal_temp:.2f} °C")
        
        return thermo_temp, internal_temp, False, False, False, False
    
    def close(self):
        """Close SPI connection"""
        self.spi.close()


if __name__ == "__main__":
    """Test script"""
    print("=" * 60)
    print("MAX31855 Thermocouple Sensor Test")
    print("=" * 60)
    
    try:
        sensor = MAX31855(spi_bus=3, spi_device=1, cs_pin=9)
        print("✓ Sensor initialized")
        
        print("\nReading 5 samples...")
        for i in range(5):
            t_temp, i_temp, fault, oc, sgnd, svcc = sensor.read_temp(verbose=True)
            if not fault:
                print(f"  Thermo: {t_temp:.2f} °C | Internal: {i_temp:.2f} °C")
        
        sensor.close()
        print("\n✓ Test complete")
        
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
