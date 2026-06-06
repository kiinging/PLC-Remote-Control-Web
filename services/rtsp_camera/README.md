# 📷 WiFi RTSP Camera — Integration Guide

Replaces the Radxa 3W camera with a standard WiFi RTSP/ONVIF IP camera.
The Orange Pi Gateway bridges the RTSP stream to MJPEG for the web dashboard.

---

## Why RTSP over the Radxa 3W?

| | Radxa 3W | WiFi RTSP Camera |
|---|---|---|
| Boot time | ~60s (full Linux boot) | ~5–15s |
| Heat | Runs hot (full SBC CPU) | Low power, dedicated encoder chip |
| Complexity | MIPI → ISP → OpenCV → MJPEG → Cloudflare Tunnel | RTSP → OrangePi bridge → Web |
| Cloudflare Tunnel on camera? | **Yes** (extra setup) | **No** — OrangePi proxies it |
| Maintenance | Python venv, GStreamer, systemd | Just configure camera IP in one file |

---

## Architecture

```
[WiFi RTSP Camera]  ──RTSP──▶  [Orange Pi Gateway]  ──MJPEG──▶  [Cloudflare Worker]  ──▶  [Browser]
  e.g. 192.168.8.x              service_rtsp_bridge.py            /api/video_feed
  rtsp://..../stream1           /video_feed  /health
```

The Orange Pi already runs 24/7 and is already exposed via Cloudflare Tunnel at
`https://orangepi.pidlab2026.shop`. No new tunnel is needed.

---

## Step 1 — Find Your Camera's RTSP URL

Most WiFi RTSP cameras use one of these URL formats (check your camera's manual):

```
rtsp://<IP>:554/stream1              (generic)
rtsp://<IP>:554/live/ch00_0          (many China brands: Reolink, TP-Link)
rtsp://admin:admin@<IP>:554/stream1  (with credentials)
rtsp://admin:<password>@<IP>/h264Preview_01_main  (Dahua)
rtsp://admin:<password>@<IP>/Streaming/Channels/101  (Hikvision)
```

**Test it on your PC first** using VLC:
`VLC → Media → Open Network Stream → paste the URL`

If you see video in VLC, the URL is correct. Note it down.

---

## Step 2 — Configure the Bridge

Edit `service_rtsp_bridge.py` and set these values at the top:

```python
RTSP_URL      = "rtsp://admin:admin@192.168.8.50:554/stream1"
STREAM_WIDTH  = 640    # resize output (set 0 to keep original)
STREAM_HEIGHT = 480
STREAM_FPS    = 10     # how many fps to forward to browser
JPEG_QUALITY  = 70     # 1–100
```

---

## Step 3 — Install on Orange Pi

SSH into the Orange Pi, then:

```bash
# 1. Go to the gateway folder
cd ~/repo/services/rtsp_camera

# 2. Install dependencies (into the existing gateway venv, or standalone)
pip install opencv-python-headless flask

# 3. Test manually first
python service_rtsp_bridge.py

# 4. Open http://OrangePi_IP:5001/health in a browser
#    You should see: {"status": "alive", "has_frame": true}

# 5. Open http://OrangePi_IP:5001/video_feed to see the live stream
```

---

## Step 4 — Install as a systemd Service

```bash
# Copy service file
sudo cp rtsp_camera.service /etc/systemd/system/

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable rtsp_camera
sudo systemctl start rtsp_camera

# Check status
sudo systemctl status rtsp_camera
```

---

## Step 5 — Update the Orange Pi Gateway (`service_web.py`)

The Orange Pi gateway already has `/video_feed` and `/camera_health` pointing to the old Radxa.
Update the `RADXA_IP` / `RADXA_PORT` in `config.py` to point to localhost:

```python
# In config.py, change:
RADXA_IP   = "127.0.0.1"   # was Radxa IP, now localhost (bridge runs on OrangePi)
RADXA_PORT = 5001           # new bridge port (was 5000)
RADXA_USER = ""             # leave blank (no Basic Auth on bridge)
RADXA_PASS = ""
```

The existing Cloudflare Worker routes `/api/video_feed` and `/api/camera_health` will
continue to work without any Worker changes. ✅

---

## Step 6 — Power Off the Radxa 3W

Once the RTSP bridge is working, the Radxa is no longer needed:

- Remove/disconnect the Radxa hardware
- The `soft_shutdown_sequence()` in the gateway still works for future use
  (you can repurpose it to restart the WiFi camera if needed)

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/health` returns `has_frame: false` | Check RTSP URL; test with VLC first |
| Stream is choppy | Lower `STREAM_FPS` or `JPEG_QUALITY` |
| `Connection refused` on port 5001 | Check service is running: `systemctl status rtsp_camera` |
| Camera disconnects randomly | Camera went to sleep — disable sleep in camera's web UI |
| Wrong camera model URL | Check brand-specific RTSP URL tables online (e.g. iSpyConnect database) |

---

## Camera URL Reference (Common Brands)

| Brand | Default RTSP URL |
|---|---|
| Reolink | `rtsp://admin:<pass>@<IP>:554/h264Preview_01_main` |
| TP-Link Tapo | `rtsp://admin:<pass>@<IP>:554/stream1` |
| Hikvision | `rtsp://admin:<pass>@<IP>/Streaming/Channels/101` |
| Dahua | `rtsp://admin:<pass>@<IP>/cam/realmonitor?channel=1&subtype=0` |
| Generic/ONVIF | `rtsp://<IP>:554/stream1` or use ONVIF Device Manager to discover |
