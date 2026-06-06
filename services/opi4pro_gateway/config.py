import os
import logging

# Base Directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Database
# Default to local folder for dev, overridable by systemd env
DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "gateway.db"))

# Logging
LOG_DIR = os.path.join(BASE_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)
MODBUS_LOG_FILE = os.path.join(LOG_DIR, "modbus.log")
MAIN_LOG_FILE = os.path.join(LOG_DIR, "gateway.log")

LOG_LEVEL = logging.INFO

# Modbus Settings (Gateway as Client)
# Note: Since Gateway is now the CLIENT, it can connect to the PLC's standard port 502.
# The "1502" restriction on Linux only applies when binding a SERVER to a port < 1024.
# If your PLC (Omron) is listening on 502, keep this as 502.
PLC_IP = "192.168.0.1" 
PLC_PORT = 1502  
MODBUS_TIMEOUT = 1.0

# Camera Settings
# Previously: Radxa 3W SBC running app.py (MIPI CSI + Flask on port 5000)
# Now:        WiFi RTSP IP camera bridged locally by service_rtsp_bridge.py
#             The bridge runs on the Orange Pi itself (port 5001).
#             No Cloudflare Tunnel needed on the camera side.
#             To configure the RTSP URL, edit:
#               services/rtsp_camera/service_rtsp_bridge.py → RTSP_URL
RADXA_IP   = "127.0.0.1"   # bridge runs locally on Orange Pi
RADXA_PORT = 5001           # rtsp_camera service port
RADXA_USER = ""             # no Basic Auth on the bridge (Worker enforces login)
RADXA_PASS = ""

# Flask Settings
FLASK_HOST = "0.0.0.0"
FLASK_PORT = 5000

# GPIO / Hardware Settings
# WiringPi Pin 10 -> Physical Pin 18 (PL2) on Orange Pi 4 Pro
LIGHT_PIN = 10
RTD_CS_PIN = 13  # WiringPi Pin 13 / PD23

# Intervals
SENSOR_SAMPLE_INTERVAL = 1.0  # Seconds
RELAY_POLL_INTERVAL = 1.0     # Seconds
MODBUS_UPDATE_INTERVAL = 0.1  # Seconds (Fast Polling)
PLC_HEARTBEAT_TIMEOUT = 5.0   # Seconds

# Trend Settings
# 30 minutes @ 2-second sampling
TREND_BUFFER_LENGTH = int(30 * 60 / SENSOR_SAMPLE_INTERVAL)


LOG_TO_FILE = False

# SMTP Settings for Feedback
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
SMTP_USER = "YOUR_GMAIL@gmail.com"             # Example: user@gmail.com
SMTP_PASS = "YOUR_GMAIL_APP_PASSWORD"          # Use an App Password, not regular password
FEEDBACK_RECEIVER = "wongkiinging@gmail.com"