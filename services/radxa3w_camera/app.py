from flask import Flask, Response, render_template
import cv2
import time
import threading
import logging
import io
from PIL import Image, ImageDraw, ImageFont
from datetime import datetime

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

# Global variables
camera = None
latest_frame = None
frame_lock = threading.Lock()

def check_gstreamer_support():
    """Verify if OpenCV is built with GStreamer support."""
    build_info = cv2.getBuildInformation()
    if "GStreamer: YES" in build_info:
        logging.info("OpenCV GStreamer support: YES")
        return True
    else:
        logging.warning("OpenCV GStreamer support: NO (This may cause failure)")
        return False

def setup_camera():
    global camera
    
    # 1. Try Rockchip Specific Pipeline (NV12 -> BGR)
    # The diagnosic showed 'Video Capture Multiplanar' and NV12/NV21 support.
    # We must use GStreamer to handle the multiplanar format.
    gstreamer_pipeline = (
        "v4l2src device=/dev/video0 ! "
        "video/x-raw,format=NV12,width=640,height=480,framerate=30/1 ! "
        "videoconvert ! "
        "video/x-raw,format=BGR ! "
        "appsink drop=1"
    )

    logging.info(f"Attempting GStreamer Pipeline: {gstreamer_pipeline}")
    cap = cv2.VideoCapture(gstreamer_pipeline, cv2.CAP_GSTREAMER)

    if cap.isOpened():
        logging.info("Camera opened successfully via GStreamer!")
        camera = cap
        return

    logging.warning("GStreamer failed. Trying standard index 0...")
    
    # 2. Fallback to standard index (unlikely to work based on logs, but good backup)
    cap = cv2.VideoCapture(0)
    if cap.isOpened():
        camera = cap
        return
            
    logging.error("No camera found! (GStreamer & Index 0 failed)")

def capture_frames():
    global latest_frame, camera
    
    check_gstreamer_support()
    setup_camera()
    
    font = None
    try:
        font = ImageFont.load_default()
    except:
        pass

    while True:
        if not camera or not camera.isOpened():
            logging.warning("Camera not open, retrying...")
            setup_camera()
            time.sleep(2)
            continue
            
        success, frame = camera.read()
        if not success:
            logging.warning("Failed to read frame")
            time.sleep(1) # Wait a bit before retry
            continue
            
        try:
            # Convert BGR (OpenCV) to RGB (PIL)
            # cv2.cvtColor is faster but let's stick to PIL for text drawing
            img = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(img)
            
            # Draw timestamp
            draw = ImageDraw.Draw(pil_img)
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            draw.text((10, 10), timestamp, fill=(0, 255, 0), font=font)
            
            # Convert to JPEG
            buf = io.BytesIO()
            pil_img.save(buf, format='JPEG', quality=50)
            
            with frame_lock:
                latest_frame = buf.getvalue()
                
        except Exception as e:
            logging.error(f"Processing error: {e}")
            
        time.sleep(0.05) 

# Start capture thread
threading.Thread(target=capture_frames, daemon=True).start()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/video_feed')
def video_feed():
    def generate():
        while True:
            with frame_lock:
                if latest_frame:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + 
                           latest_frame + b'\r\n')
            time.sleep(0.1) # 10 FPS stream to client

    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False, threaded=True)
