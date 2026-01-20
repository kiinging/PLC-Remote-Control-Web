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

def setup_camera():
    global camera
    # Try index 0, then 1, then -1 to find a camera
    for idx in [0, 1, -1]:
        try:
            cap = cv2.VideoCapture(idx)
            if cap.isOpened():
                logging.info(f"Camera opened on index {idx}")
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 320)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 240)
                cap.set(cv2.CAP_PROP_FPS, 15)
                camera = cap
                return
        except Exception as e:
            logging.warn(f"Failed to open camera index {idx}: {e}")
            
    logging.error("No camera found!")

def capture_frames():
    global latest_frame, camera
    
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
            time.sleep(0.5)
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
            
        time.sleep(0.05) # Cap FPS slightly (approx 20fps)

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
