import cv2
import sys
import os

print("\n=== OpenCV Environment Check ===")
print(f"Python executable: {sys.executable}")
try:
    print(f"OpenCV version: {cv2.__version__}")
    print(f"OpenCV file: {cv2.__file__}")
except AttributeError:
    print("Could not find cv2.__file__")

build_info = cv2.getBuildInformation()
gst_status = "YES" if "GStreamer: YES" in build_info else "NO"
print(f"GStreamer support in OpenCV: {gst_status}")

print("\n=== Pipeline Test ===")
# Matches the "Generic" pipeline in app.py
pipeline = (
    "v4l2src device=/dev/video0 ! "
    "videoconvert ! "
    "video/x-raw,format=BGR ! "
    "appsink drop=1"
)
print(f"Attempting pipeline:\n{pipeline}")

cap = cv2.VideoCapture(pipeline, cv2.CAP_GSTREAMER)

if cap.isOpened():
    print("✅ Pipeline OPENED successfully.")
    ret, frame = cap.read()
    if ret:
        print(f"✅ Frame READ successfully. Shape: {frame.shape}")
        # Save it to prove we got data
        cv2.imwrite("test_capture.jpg", frame)
        print("📸 Saved 'test_capture.jpg' - check this file if possible.")
    else:
        print("❌ Pipeline opened, but verify_read() returned False.")
else:
    print("❌ Failed to open pipeline.")
    print("If GStreamer support is NO, this is expected.")

print("\n=== Standard Index Test (Fallback) ===")
cap = cv2.VideoCapture(0)
if cap.isOpened():
    print("✅ Opened Index 0")
    ret, frame = cap.read()
    if ret:
        print(f"✅ Frame READ from Index 0. Shape: {frame.shape}")
    else:
        print("❌ Opened Index 0 but verify_read() failed.")
else:
    print("❌ Failed to open Index 0")
