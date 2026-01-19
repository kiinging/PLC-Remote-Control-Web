from flask import Flask, Response, render_template
from picamera2 import Picamera2
import io
from PIL import Image
import time
import threading
import logging
from PIL import ImageDraw, ImageFont
from datetime import datetime

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

picam2 = Picamera2()
picam2.configure(picam2.create_preview_configuration(main={"size": (320, 240)}))  # Smaller resolution
picam2.start()
time.sleep(5)  # let the sensor initialise fully

latest_frame = None
frame_lock = threading.Lock()

def capture_frames():
    global latest_frame
    
    # Use default PIL font (no TTF needed on Pi OS Lite)
    try:
        font = ImageFont.load_default()
    except Exception as e:
        logging.error(f"Font load error: {e}")
        font = None

    while True:
        try:
            frame = picam2.capture_array()
            img = Image.fromarray(frame).convert("RGB")

            # Draw timestamp
            draw = ImageDraw.Draw(img)
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            draw.text((10, 10), timestamp, fill=(0, 255, 0), font=font)

            # Convert to JPEG
            buf = io.BytesIO()
            img.save(buf, format='JPEG', quality=40)

            with frame_lock:
                latest_frame = buf.getvalue()
                
        except Exception as e:
            logging.error(f"Capture error: {e}, restarting camera...")
            try:
                picam2.stop()
                time.sleep(1)
                picam2.start()
            except Exception as e2:
                logging.error(f"Restart failed: {e2}")
            time.sleep(0.2)
            continue

# Start capture thread
threading.Thread(target=capture_frames, daemon=True).start()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/video_feed')
def video_feed():
    def generate():
        while True:
            try:
                with frame_lock:
                    if latest_frame:
                        yield (b'--frame\r\n'
                               b'Content-Type: image/jpeg\r\n\r\n' + 
                               latest_frame + b'\r\n')
                time.sleep(0.1)
            except GeneratorExit:
                break
            except Exception as e:
                logging.error(f"Stream error: {e}")
                break

    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/snapshot')
def snapshot():
    with frame_lock:
        if latest_frame:
            return Response(latest_frame, mimetype='image/jpeg')
    return Response(status=404)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False, threaded=True)
