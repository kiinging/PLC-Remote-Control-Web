# service_rtsp_bridge.py
#
# Runs on the Orange Pi.
# Pulls an RTSP stream from a WiFi IP camera, converts to MJPEG,
# and serves it over HTTP so the existing Cloudflare Worker route
# /api/video_feed and /api/camera_health keep working without changes.
#
# Port: 5001  (gateway service_web.py proxies on port 5000, so we use 5001)
# Endpoint: GET /video_feed  → MJPEG stream
# Endpoint: GET /health      → JSON status
#
# ------------------------------------------------------------------
# ⚙️  CONFIGURE THESE FOUR VALUES FOR YOUR CAMERA:
# ------------------------------------------------------------------
RTSP_URL      = "rtsp://admin:admin@192.168.8.50:554/stream1"  # ← your camera
STREAM_WIDTH  = 640    # output width in pixels  (0 = keep original)
STREAM_HEIGHT = 480    # output height in pixels (0 = keep original)
STREAM_FPS    = 10     # frames per second sent to browser
JPEG_QUALITY  = 70     # JPEG compression 1-100 (lower = smaller = faster)
FLASK_PORT    = 5001   # must not clash with gateway (5000)
# ------------------------------------------------------------------

import cv2
import time
import threading
import logging
import os
from flask import Flask, Response, jsonify

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [rtsp_bridge] %(levelname)s %(message)s"
)
logger = logging.getLogger("rtsp_bridge")

app = Flask(__name__)

# ---- Shared frame state ----
latest_frame: bytes | None = None
latest_frame_ts: float = 0.0
frame_lock = threading.Lock()


def _open_capture() -> cv2.VideoCapture | None:
    """Open the RTSP stream with a short timeout so we don't hang forever."""
    logger.info(f"Connecting to RTSP stream: {RTSP_URL}")
    # CAP_FFMPEG is the most compatible backend for RTSP on Linux
    cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)

    # Reduce internal buffer to 1 frame so we always get the latest image
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    # Give the camera up to 5 seconds to connect
    deadline = time.time() + 5.0
    while time.time() < deadline:
        if cap.isOpened():
            ret, _ = cap.read()
            if ret:
                logger.info("RTSP stream opened successfully.")
                return cap
        time.sleep(0.5)

    cap.release()
    logger.warning("Could not open RTSP stream.")
    return None


def capture_loop():
    """Background thread: continuously read frames from the RTSP stream."""
    global latest_frame, latest_frame_ts

    backoff = 2  # reconnect delay (seconds), doubles on repeated failures

    while True:
        cap = _open_capture()
        if cap is None:
            logger.warning(f"Will retry in {backoff}s...")
            time.sleep(backoff)
            backoff = min(backoff * 2, 30)
            continue

        backoff = 2  # reset on success
        frame_interval = 1.0 / STREAM_FPS

        while True:
            t0 = time.time()
            ret, frame = cap.read()

            if not ret:
                logger.warning("Frame read failed — reconnecting to camera.")
                break  # outer loop will reconnect

            # Optional resize
            if STREAM_WIDTH > 0 and STREAM_HEIGHT > 0:
                frame = cv2.resize(frame, (STREAM_WIDTH, STREAM_HEIGHT))

            # Encode to JPEG
            encode_params = [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY]
            ok, buf = cv2.imencode(".jpg", frame, encode_params)
            if not ok:
                continue

            with frame_lock:
                latest_frame = buf.tobytes()
                latest_frame_ts = time.time()

            # Pace ourselves to target FPS
            elapsed = time.time() - t0
            sleep_time = frame_interval - elapsed
            if sleep_time > 0:
                time.sleep(sleep_time)

        cap.release()


# Start background capture thread
threading.Thread(target=capture_loop, daemon=True, name="rtsp-capture").start()


# ---- HTTP Endpoints ----

@app.route("/health", methods=["GET"])
def health():
    """
    Public health endpoint. Called by Orange Pi gateway to check camera status.
    Returns JSON compatible with the existing camera_health check in service_web.py.
    """
    with frame_lock:
        has_frame = latest_frame is not None
        frame_age = (time.time() - latest_frame_ts) if has_frame else None

    return jsonify({
        "status": "alive",
        "ts": time.time(),
        "has_frame": has_frame,
        "frame_age_sec": round(frame_age, 2) if frame_age is not None else None,
        "rtsp_url": RTSP_URL.split("@")[-1]  # hide credentials in output
    }), 200


@app.route("/video_feed", methods=["GET"])
def video_feed():
    """
    MJPEG stream endpoint. Compatible with the existing worker.js /api/video_feed proxy.
    No authentication here — the Cloudflare Worker enforces login before proxying.
    """
    def generate():
        while True:
            frame_bytes = None
            with frame_lock:
                frame_bytes = latest_frame

            if frame_bytes:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" +
                    frame_bytes +
                    b"\r\n"
                )
            else:
                # No frame yet — send a small delay to avoid busy-wait
                time.sleep(0.1)

            time.sleep(1.0 / STREAM_FPS)

    return Response(
        generate(),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )


if __name__ == "__main__":
    logger.info(f"RTSP bridge starting on port {FLASK_PORT}")
    app.run(host="0.0.0.0", port=FLASK_PORT, threaded=True)
