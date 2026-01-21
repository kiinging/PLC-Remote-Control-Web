import OPi.GPIO as GPIO
import time

# Set up Sunxi-style GPIO mode
GPIO.setmode(GPIO.SUNXI)

# Define the LED pin
LED_PIN = "PC14"  # Use correct Sunxi pin naming convention

# Configure the LED pin as OUTPUT
GPIO.setup(LED_PIN, GPIO.OUT)

try:
    while True:
        # Turn the LED on
        GPIO.output(LED_PIN, GPIO.HIGH)
        print("LED ON")
        time.sleep(1)  # Wait for 1 second

        # Turn the LED off
        GPIO.output(LED_PIN, GPIO.LOW)
        print("LED OFF")
        time.sleep(1)  # Wait for 1 second

except KeyboardInterrupt:
    print("Blinking stopped by user.")

finally:
    GPIO.cleanup()  # Clean up GPIO settings