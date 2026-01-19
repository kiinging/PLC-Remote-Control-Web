#!/usr/bin/python3

from picamera2 import Picamera2
import time

picam2 = Picamera2()
picam2.configure(picam2.create_still_configuration())

picam2.start()
time.sleep(2)  # let camera warm up

metadata = picam2.capture_file("test.jpg")
print("Captured image saved as test.jpg")
print(metadata)

picam2.close()

