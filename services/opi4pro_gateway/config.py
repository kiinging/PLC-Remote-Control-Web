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

# Modbus Settings
MODBUS_HOST = "0.0.0.0"
MODBUS_PORT = 1502

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
MODBUS_UPDATE_INTERVAL = 0.5    # Seconds

# Trend Settings
# 30 minutes @ 2-second sampling
TREND_BUFFER_LENGTH = int(30 * 60 / SENSOR_SAMPLE_INTERVAL)


LOG_TO_FILE = False