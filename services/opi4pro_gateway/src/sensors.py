import spidev
import time
import math
import OPi.GPIO as GPIO

# === GPIO Setup ===
GPIO.setwarnings(False)
GPIO.setmode(GPIO.SUNXI)

# === MAX31865 (RTD) Configuration ===
class MAX31865:
    def __init__(self, spi_bus=1, spi_device=1, cs_pin="PC7"):
        self.cs_pin = cs_pin
        GPIO.setup(self.cs_pin, GPIO.OUT)
        GPIO.output(self.cs_pin, GPIO.HIGH)

        self.spi = spidev.SpiDev()
        self.spi.open(spi_bus, spi_device)
        self.spi.max_speed_hz = 500000
        self.spi.mode = 0b01  # Mode 1

    def write_register(self, reg, val):
        GPIO.output(self.cs_pin, GPIO.LOW)
        self.spi.xfer2([0x80 | reg, val])
        GPIO.output(self.cs_pin, GPIO.HIGH)

    def read_registers(self, start_reg, length):
        GPIO.output(self.cs_pin, GPIO.LOW)
        resp = self.spi.xfer2([start_reg] + [0x00]*length)
        GPIO.output(self.cs_pin, GPIO.HIGH)
        return resp[1:]

    def calc_pt100_temp(self, rtd_adc_code):
        R_REF = 430.0
        Res0 = 100.0
        a = 0.00390830
        b = -0.0000005775
        c = -0.00000000000418301  # For -200°C to 0°C

        Res_RTD = (rtd_adc_code * R_REF) / 32768.0
        temp_C_line = (rtd_adc_code / 32.0) - 256.0

        try:
            temp_C = (-a + math.sqrt(a**2 - 4*b*(1 - Res_RTD/Res0))) / (2*b)
            if temp_C < 0:
                temp_C = temp_C_line  # fallback
        except:
            temp_C = -999.0

        print("\n[ MAX31865 (RTD) ]")
        print(f"RTD ADC Code       : {rtd_adc_code}")
        print(f"PT100 Resistance   : {Res_RTD:.3f} Ω")
        print(f"Linear Temp        : {temp_C_line:.3f} °C")
        print(f"Callendar-Van Dusen: {temp_C:.3f} °C")
        return temp_C

    def read_temperature(self):
        self.write_register(0x00, 0xB2)  # single-shot config
        time.sleep(0.1)
        data = self.read_registers(0x00, 8)
        rtd_adc = ((data[1] << 8) | data[2]) >> 1
        return self.calc_pt100_temp(rtd_adc)

    def close(self):
        self.spi.close()


# === MAX31855 (Thermocouple) Configuration ===
class MAX31855:
    def __init__(self, spi_bus=1, spi_device=1, cs_pin="PC10"):
        self.cs_pin = cs_pin
        GPIO.setup(self.cs_pin, GPIO.OUT)
        GPIO.output(self.cs_pin, GPIO.HIGH)

        self.spi = spidev.SpiDev()
        self.spi.open(spi_bus, spi_device)
        self.spi.max_speed_hz = 5000000
        self.spi.mode = 0b00  # SPI mode 0

    def read_temp(self):
        GPIO.output(self.cs_pin, GPIO.LOW)
        raw = self.spi.readbytes(4)
        GPIO.output(self.cs_pin, GPIO.HIGH)

        if len(raw) != 4:
            raise RuntimeError("Failed to read 4 bytes")

        print("\n[ MAX31855 (Thermocouple) ]")
        print(f"Raw Bytes          : {raw}")

        value = (raw[0] << 24) | (raw[1] << 16) | (raw[2] << 8) | raw[3]

        if value & 0x00010000:  # Fault bit
            print("Sensor Fault Detected!")
            return None, None, True, bool(value & 0x01), bool(value & 0x02), bool(value & 0x04)

        internal = (value >> 4) & 0x0FFF
        if value & 0x00008000:
            internal -= 4096
        internal_temp = internal * 0.0625

        temp = ((value >> 18) & 0x3FFF)
        if value & 0x80000000:
            temp -= 0x4000
        thermo_temp = temp * 0.25

        print(f"Thermocouple Temp  : {thermo_temp:.2f} °C")
        print(f"Internal Temp      : {internal_temp:.2f} °C")

        return thermo_temp, internal_temp, False, False, False, False

    def close(self):
        self.spi.close()


# === Main Program ===
if __name__ == "__main__":
    rtd_sensor = MAX31865()
    thermo_sensor = MAX31855()

    try:
        while True:
            # RTD (MAX31865)
            rtd_temp = rtd_sensor.read_temperature()

            # Thermocouple (MAX31855)
            t_temp, i_temp, fault, open_circuit, short_gnd, short_vcc = thermo_sensor.read_temp()
            if fault:
                print("FAULT DETECTED:")
                if open_circuit:
                    print("  - Open Circuit")
                if short_gnd:
                    print("  - Short to GND")
                if short_vcc:
                    print("  - Short to VCC")

            # === Optional: Basic Calibration Suggestion ===
            print("\n[ Comparison ]")
            if t_temp is not None:
                diff = t_temp - rtd_temp
                print(f"Δ Thermo - RTD Temp: {t_temp:.2f} °C - [RTD] ≈ {diff:.2f} °C")

            print("-" * 40)
            time.sleep(2)

    except KeyboardInterrupt:
        print("Exiting...")

    finally:
        rtd_sensor.close()
        thermo_sensor.close()
        GPIO.cleanup()
