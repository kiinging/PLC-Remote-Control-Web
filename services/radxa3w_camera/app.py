from flask import Flask, Response, render_template, jsonify
from flask_basicauth import BasicAuth
import cv2
import time
import threading
import logging
import io
from PIL import Image, ImageDraw, ImageFont
from datetime import datetime

app = Flask(__name__)

# Use gunicorn/systemd logs
logger = logging.getLogger("camera")
logger.setLevel(logging.INFO)

# ---- Auth config ----
app.config['BASIC_AUTH_USERNAME'] = 'radxa'
app.config['BASIC_AUTH_PASSWORD'] = 'radxa'
app.config['BASIC_AUTH_FORCE'] = True # Protect entire app

basic_auth = BasicAuth(app)

# ---- Globals ----
camera = None
latest_frame = None
latest_frame_ts = 0.0
frame_lock = threading.Lock()

def check_gstreamer_support():
    build_info = cv2.getBuildInformation()
    ok = "GStreamer: YES" in build_info
    logger.info(f"OpenCV GStreamer support: {'YES' if ok else 'NO'}")
    return ok

def setup_camera():
    global camera

    # release old handle if any
    try:
        if camera is not None:
            camera.release()
    except Exception:
        pass
    camera = None

    pipelines = [
        (
            "Generic 640x480",
            "v4l2src device=/dev/video0 ! videoconvert ! videoscale ! "
            "video/x-raw,width=640,height=480 ! video/x-raw,format=BGR ! appsink drop=1"
        ),
        (
            "Small 320x240",
            "v4l2src device=/dev/video0 ! video/x-raw,width=320,height=240 ! "
            "videoconvert ! video/x-raw,format=BGR ! appsink drop=1"
        )
    ]

    for name, pipe in pipelines:
        logger.info(f"Trying camera pipeline: {name}")
        cap = cv2.VideoCapture(pipe, cv2.CAP_GSTREAMER)
        if cap.isOpened():
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)   # ✅ ADD THIS LINE
            ret, _ = cap.read()
            if ret:
            logger.info(f"Camera opened OK: {name}")
            camera = cap
            return True
        cap.release()

    logger.warning("GStreamer failed. Trying VideoCapture(0)...")
    cap = cv2.VideoCapture(0)
    if cap.isOpened():
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)       # ✅ ADD THIS LINE
        camera = cap
        logger.info("Camera opened OK: index 0")
        return True

    logger.error("No camera found (all pipelines failed).")
    return False


def capture_frames():
    global latest_frame, latest_frame_ts, camera

    check_gstreamer_support()

    font = None
    try:
        font = ImageFont.load_default()
    except Exception:
        pass

    backoff = 1  # seconds, grows if camera fails
    while True:
        if camera is None or not camera.isOpened():
            logger.warning("Camera not open. Attempting setup...")
            ok = setup_camera()
            backoff = 1 if ok else min(backoff * 2, 10)
            time.sleep(backoff)
            continue

        success, frame = camera.read()
        if not success:
            logger.warning("Failed to read frame. Reopening camera...")
            setup_camera()
            time.sleep(1)
            continue

        try:
            img = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(img)

            draw = ImageDraw.Draw(pil_img)
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            draw.text((10, 10), timestamp, fill=(0, 255, 0), font=font)

            buf = io.BytesIO()
            pil_img.save(buf, format='JPEG', quality=60)

            with frame_lock:
                latest_frame = buf.getvalue()
                latest_frame_ts = time.time()

        except Exception:
            logger.exception("Frame processing error")

        time.sleep(0.05)  # ~20 FPS capture; stream can be slower

threading.Thread(target=capture_frames, daemon=True).start()

# ✅ Public health endpoint (no auth)
@app.route('/health', methods=['GET'])
def health():
    with frame_lock:
        has_frame = latest_frame is not None
        age = (time.time() - latest_frame_ts) if has_frame else None

    return jsonify({
        "status": "alive",
        "ts": time.time(),
        "has_frame": has_frame,
        "frame_age_sec": age
    }), 200

@app.route('/')
@basic_auth.required
def index():
    return render_template('index.html')

@app.route('/video_feed')
@basic_auth.required
def video_feed():
    def generate():
        # keep connection alive even if no frames yet
        while True:
            frame = None
            with frame_lock:
                frame = latest_frame
            if frame:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' +
                       frame + b'\r\n')
            time.sleep(0.1)  # 10 FPS to client

    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')
