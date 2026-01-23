"""
MAX31865 RTD Temperature Sensor Driver
- Sensor: Platinum RTD (PT100/PT1000)
- Interface: SPI
- Platform: Orange Pi 4 Pro (SPI3)
"""

import spidev
import time
import math
import wiringpi


class MAX31865:
    """
    MAX31865 RTD-to-Digital Converter
    
    Args:
        spi_bus (int): SPI bus number (default: 3 for Orange Pi 4 Pro)
        spi_device (int): SPI device number (default: 0)
        cs_pin (int): Chip Select pin (wPi number, default: 13 for PD23)
    """
    
    def __init__(self, spi_bus=3, spi_device=0, cs_pin=13):
        """Initialize MAX31865 sensor"""
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
        self.spi.max_speed_hz = 500000
        self.spi.mode = 0b01  # SPI mode 1
    
    def write_register(self, reg, val):
        """Write a single register"""
        wiringpi.digitalWrite(self.cs_pin, wiringpi.LOW)
        self.spi.xfer2([0x80 | reg, val])
        wiringpi.digitalWrite(self.cs_pin, wiringpi.HIGH)
    
    def read_registers(self, start_reg, length):
        """Read consecutive registers"""
        wiringpi.digitalWrite(self.cs_pin, wiringpi.LOW)
        resp = self.spi.xfer2([start_reg] + [0x00] * length)
        wiringpi.digitalWrite(self.cs_pin, wiringpi.HIGH)
        return resp[1:]
    
    def calc_pt100_temp(self, rtd_adc_code):
        """
        Calculate temperature from RTD ADC code
        Uses Callendar-Van Dusen equation for PT100
        
        Args:
            rtd_adc_code (int): 16-bit ADC code from sensor
            
        Returns:
            float: Temperature in °C
        """
        R_REF = 430.0  # Reference resistor value (Ω)
        Res0 = 100.0   # PT100 resistance at 0°C (Ω)
        a = 0.00390830
        b = -0.0000005775
        c = -0.00000000000418301  # For -200°C to 0°C
        
        Res_RTD = (rtd_adc_code * R_REF) / 32768.0
        temp_C_line = (rtd_adc_code / 32.0) - 256.0
        
        try:
            temp_C = (-a + math.sqrt(a**2 - 4*b*(1 - Res_RTD/Res0))) / (2*b)
            if temp_C < 0:
                temp_C = temp_C_line  # fallback for negative temps
        except:
            temp_C = -999.0
        
        return temp_C
    
    def read_temperature(self, verbose=False):
        """
        Read temperature from sensor
        
        Args:
            verbose (bool): Print debug information
            
        Returns:
            float: Temperature in °C
        """
        self.write_register(0x00, 0xB2)  # single-shot config
        time.sleep(0.1)
        data = self.read_registers(0x00, 8)
        rtd_adc = ((data[1] << 8) | data[2]) >> 1
        temp = self.calc_pt100_temp(rtd_adc)
        
        if verbose:
            print("\n[ MAX31865 (RTD) ]")
            print(f"RTD ADC Code       : {rtd_adc}")
            Res_RTD = (rtd_adc * 430.0) / 32768.0
            print(f"PT100 Resistance   : {Res_RTD:.3f} Ω")
            print(f"Temperature        : {temp:.2f} °C")
        
        return temp
    
    def close(self):
        """Close SPI connection"""
        self.spi.close()


if __name__ == "__main__":
    """Test script"""
    print("=" * 60)
    print("MAX31865 RTD Sensor Test")
    print("=" * 60)
    
    try:
        sensor = MAX31865(spi_bus=3, spi_device=0, cs_pin=13)
        print("✓ Sensor initialized")
        
        print("\nReading 5 samples...")
        for i in range(5):
            temp = sensor.read_temperature(verbose=True)
            time.sleep(1)
        
        sensor.close()
        print("\n✓ Test complete")
        
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
