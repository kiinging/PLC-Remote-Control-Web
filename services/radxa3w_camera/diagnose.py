import cv2
import subprocess
import os

def check_v4l2():
    print("\n--- Checking V4L2 Devices ---")
    try:
        result = subprocess.run(['v4l2-ctl', '--list-devices'], capture_output=True, text=True)
        print(result.stdout)
    except FileNotFoundError:
        print("v4l2-ctl not found. Install it with: sudo apt install v4l-utils")

def check_formats():
    print("\n--- Checking Supported Formats for /dev/video0 ---")
    try:
        result = subprocess.run(['v4l2-ctl', '-d', '/dev/video0', '--list-formats-ext'], capture_output=True, text=True)
        print(result.stdout[:500]) # Print first 500 chars
    except Exception as e:
        print(f"Error: {e}")

def test_opencv_gstreamer():
    print("\n--- Testing OpenCV with GStreamer Pipeline ---")
    # Common pipeline for Rockchip ISP to OpenCV
    pipeline = (
        "libcamerasrc ! video/x-raw, width=640, height=480, framerate=30/1 ! "
        "videoconvert ! video/x-raw, format=BGR ! appsink"
    )
    # Alternative v4l2src pipeline
    pipeline_v4l2 = (
        "v4l2src device=/dev/video0 ! video/x-raw, width=640, height=480, framerate=30/1 ! "
        "videoconvert ! video/x-raw, format=BGR ! appsink"
    )
    
    print(f"Trying pipeline: {pipeline_v4l2}")
    cap = cv2.VideoCapture(pipeline_v4l2, cv2.CAP_GSTREAMER)
    if cap.isOpened():
        ret, frame = cap.read()
        if ret:
            print("SUCCESS: Frame captured via GStreamer/V4L2!")
        else:
            print("FAILURE: Pipeline opened but no frame.")
        cap.release()
    else:
        print("FAILURE: Could not open GStreamer pipeline.")

def test_opencv_standard():
    print("\n--- Testing Standard OpenCV (Index 0) ---")
    cap = cv2.VideoCapture(0)
    if cap.isOpened():
        ret, frame = cap.read()
        if ret:
            print("SUCCESS: Frame captured via standard Index 0!")
        else:
            print("FAILURE: Device opened but no frame (Timeout?).")
        cap.release()
    else:
        print("FAILURE: Could not open /dev/video0.")

if __name__ == "__main__":
    check_v4l2()
    check_formats()
    test_opencv_standard()
    test_opencv_gstreamer()
