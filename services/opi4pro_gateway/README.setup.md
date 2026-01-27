# Gateway Services Setup (Microservices Architecture)

The gateway has been refactored into **4 independent microservices** communicating via a shared **SQLite database**.

## Services Overview

1.  **`gateway-api.service`**: Flask Web API (Port 5000). Handles dashboard requests.
2.  **`gateway-sensor.service`**: MAX31865 Sensor Loop. Reads temp every 2s.
3.  **`gateway-relay.service`**: ESP32 Relay Monitor. Polls ESP32 status.
4.  **`gateway-modbus.service`**: Modbus TCP Server (Port 1502). Bridges data to PLC.

## Setup Instructions

### 1. System Requirements

-   **OS**: Armbian / Linux (Orange Pi)
-   **Hardware**: Orange Pi 4 Pro (or compatible) with SPI enabled.
-   **Python**: Python 3.9+

### 2. Prepare Database Directory
The services need a shared directory for `gateway.db`.

```bash
sudo mkdir -p /var/lib/opi4pro_gateway
sudo chown orangepi:orangepi /var/lib/opi4pro_gateway
```

### 3. Install Dependencies
```bash
cd services/opi4pro_gateway
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 4. Install Systemd Services
Copy the unit files to the systemd directory.

```bash
sudo cp gateway-*.service /etc/systemd/system/
sudo systemctl daemon-reload
```

### 5. Enable and Start
```bash
sudo systemctl enable gateway-api gateway-sensor gateway-relay gateway-modbus
sudo systemctl restart gateway-api gateway-sensor gateway-relay gateway-modbus
```

## Verification

Check status of all services:
```bash
sudo systemctl status gateway-*
```

Check logs (e.g., Sensor):
```bash
journalctl -u gateway-sensor -f
```

Check API:
```bash
curl http://localhost:5000/temp
```

## Configuration
Edit `config.py` to change pins, ports, and logging settings.
