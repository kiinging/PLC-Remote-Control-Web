import logging

logger = logging.getLogger("gpio")

class GpioManager:
    def __init__(self):
        self.available = False
        self.wiringpi = None
        
        try:
            import wiringpi
            self.wiringpi = wiringpi
            # wiringpi.wiringPiSetup() # Do not call setup here, call it explicitly or lazy load?
            # Standard wiringpi usage requires setup first.
            if self.wiringpi.wiringPiSetup() != -1:
                self.available = True
                logger.info("✅ WiringPi initialized successfully.")
            else:
                logger.error("❌ WiringPi Setup Returned -1")
        except ImportError:
            logger.warning("⚠️ WiringPi library not found. GPIO operations will be mocked.")
        except Exception as e:
            logger.error(f"❌ WiringPi Initialization Error: {e}")

    def setup_output(self, pin):
        if self.available:
            try:
                self.wiringpi.pinMode(pin, self.wiringpi.OUTPUT)
            except Exception as e:
                logger.error(f"Error setting pin {pin} mode: {e}")

    def write(self, pin, state):
        """
        Write state to PIN.
        state: 1/True/HIGH or 0/False/LOW
        """
        if self.available:
            try:
                val = self.wiringpi.HIGH if state else self.wiringpi.LOW
                self.wiringpi.digitalWrite(pin, val)
            except Exception as e:
                logger.error(f"Error writing to pin {pin}: {e}")
        else:
            logger.debug(f"[MOCK] Write {state} to Pin {pin}")

# Global instance
gpio = GpioManager()
