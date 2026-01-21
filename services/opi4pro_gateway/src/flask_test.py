from flask import Flask, request
import OPi.GPIO as GPIO

app = Flask(__name__)

# Define the LED pin
LED_PIN = "PC9"  # Change if needed
GPIO.setmode(GPIO.SUNXI)
GPIO.setup(LED_PIN, GPIO.OUT)

@app.route('/led/on', methods=['POST'])
def turn_led_on():
    GPIO.output(LED_PIN, GPIO.HIGH)
    return "LED Turned ON", 200

@app.route('/led/off', methods=['POST'])
def turn_led_off():
    GPIO.output(LED_PIN, GPIO.LOW)
    return "LED Turned OFF", 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
