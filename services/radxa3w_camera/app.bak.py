from flask import Flask, render_template, Response, request, jsonify
import cv2, os

app = Flask(__name__)

# Basic in-memory user auth (replace with Worker or DB later)
USERS = {"admin": "1234"}

# Global camera
camera = cv2.VideoCapture(0)

# Device control status
device_on = False

def generate_frames():
    while True:
        success, frame = camera.read()
        if not success:
            break
        else:
            _, buffer = cv2.imencode('.jpg', frame)
            frame = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    if USERS.get(username) == password:
        return jsonify({"status": "ok"}), 200
    else:
        return jsonify({"status": "error"}), 401

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/device', methods=['POST'])
def device_toggle():
    global device_on
    data = request.get_json()
    action = data.get('action')
    if action == "on":
        # TODO: trigger GPIO
        device_on = True
    elif action == "off":
        # TODO: trigger GPIO
        device_on = False
    return jsonify({"device_on": device_on})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=False)
