# Orange Pi 4 Pro — Flask + MAX31865 + Modbus + wiringpi

Control and monitoring hub for Omron NJ301 PLC running on **Orange Pi 4 Pro** with **Ubuntu 22.04 LTS**.

---

## 🔑 Core Components

| File | Purpose |
|------|---------|
| `web_api.py` | Flask REST API for web/Cloudflare Worker |
| `temp_reading.py` | Reads MAX31865 (RTD) & MAX31855 (thermocouple) sensors |
| `modbus_server.py` | Modbus TCP bridge (port 1502) to PLC |
| `shared_data.py` | Shared memory for inter-process communication |

---

## 🚀 Quick Start (Fresh Device Setup)

### 1️⃣ Clone the Repository

```bash
git clone https://github.com/kiinging/PLC-Remote-Control-Web.git
cd PLC-Remote-Control-Web/services/opi4pro_gateway
```

### 2️⃣ Create Symbolic Link (Optional)

If you want quick access from home directory:

```bash
cd ~
ln -s /home/orangepi/PLC-Remote-Control-Web/services/opi4pro_gateway opi4pro_gateway
cd opi4pro_gateway
```

### 3️⃣ Run Setup Script

```bash
bash setup.sh
```

**What it does:**
- Updates system packages
- Installs: `python3-venv`, `git`, `swig`, `python3-setuptools`, `build-essential`, etc.
- Creates virtual environment (`venv/`)
- Clones and builds **wiringOP-Python from source** (required—not on PyPI)
- Installs Flask, pymodbus, requests, gunicorn

⚠️ **Note on wiringOP-Python:** The setup includes a critical step: `python3 generate-bindings.py > bindings.i` which generates SWIG bindings needed for compilation.

### 4️⃣ Configure GPIO Group (Optional but Recommended)

To run GPIO scripts without `sudo` every time, add `orangepi` user to `gpio` group:

```bash
sudo usermod -aG gpio orangepi
sudo usermod -aG spi orangepi
```

Then log out and log back in for group changes to take effect:

```bash
logout
# Re-login
```

### 5️⃣ Test LED Blink

Activate venv and test GPIO control:

```bash
source venv/bin/activate
sudo python test/test_blink.py
```

Expected output:
```
==================================================
Orange Pi 4 Pro - LED Blink Test
Pin: PE3 (Physical pin 21, wPi pin 12)
==================================================
✓ GPIO initialized: wPi pin 12 set as OUTPUT
Blinking LED 5 times (delay: 0.5s)
  [1/5] LED ON
  [1/5] LED OFF
  ...
✓ Blink test completed successfully
✓ Cleanup complete
```

**LED should blink 5 times if connected to physical pin 21 (PE3).**

---

## 📌 GPIO Pin Configuration

- **Physical Pin:** 18
- **GPIO Name:** PL2
- **wPi Number:** 10 (used in code via wiringpi)

Check available pins:
```bash
gpio readall
```

---

## 🔹 Run Services

### 1. Standalone Flask API

```bash
source venv/bin/activate
sudo ./venv/bin/python web_api.py
```

API endpoints:
- `POST /light/on` → Turn LED on
- `POST /light/off` → Turn LED off
- `GET /temp` → Get temperature readings
- `GET /control_status` → Get current status
- `POST /setpoint` → Update setpoint
- `POST /pid` → Update PID parameters

### 2. Systemd Services (Auto-Start on Boot)

```bash
sudo cp flaskserver.service /etc/systemd/system/
sudo cp cloudflared.service /etc/systemd/system/

sudo systemctl enable flaskserver cloudflared
sudo systemctl start flaskserver cloudflared
```

### Service Management

```bash
# Restart after code changes
sudo systemctl restart flaskserver

# View live logs
sudo journalctl -u flaskserver -f

# Stop service
sudo systemctl stop flaskserver

# Disable auto-start
sudo systemctl disable flaskserver cloudflared
```

---

## 🔹 Modbus TCP Configuration

- **Port:** 1502
- **Input Registers (IR):** Temperature, status (read-only from PLC)
- **Holding Registers (HR):** Setpoint, PID values (read/write from PLC)

| Register | Value |
|----------|-------|
| IR0-IR1 | RTD Temperature (float) |
| IR2-IR3 | Setpoint (float) |
| IR4-IR5 | Manual MV (float) |
| IR6 | Mode (0=Manual, 1=Auto, 2=Tune) |
| IR7 | PLC Status (0=Off, 1=On) |
| IR8 | Light Status (0=Off, 1=On) |

---

## 🔹 Useful Commands

```bash
# Check system info
lscpu
free -h
df -h

# Check GPIO
gpio readall

# Check Wi-Fi
iw dev wlan0 link
ip addr show wlan0

# System logs
sudo journalctl -u flaskserver -f

# Check running processes
ps aux | grep python
```

---

## ⚠️ Important Notes

### wiringOP-Python (Not on PyPI!)

- **Must be built from source**—not available via `pip install wiringpi`
- The setup.sh automates this: `git clone --recursive` + `generate-bindings.py` + `python3 setup.py install`
- **GPIO always needs `sudo`** even if installed in venv (hardware access requirement)

### Previous OPi.GPIO Migration

If migrating from **OPi.GPIO** (Orange Pi Zero 3):
- OPi.GPIO is **not compatible** with Orange Pi 4 Pro
- Use **wiringpi** (wiringOP-Python) instead
- Pin numbering changed from "PC14" strings to wPi numbers (e.g., wPi pin 12)

---

## 🐛 Troubleshooting

### `ModuleNotFoundError: No module named 'wiringpi'`

```bash
# Re-run setup to rebuild wiringpi
cd /tmp
rm -rf wiringOP-Python
git clone --recursive https://github.com/orangepi-xunlong/wiringOP-Python.git -b next
cd wiringOP-Python
git submodule update --init --remote
python3 generate-bindings.py > bindings.i
python3 setup.py install
```

### GPIO Permission Denied

```bash
# Ensure user is in gpio group
sudo usermod -aG gpio orangepi

# Log out and back in
logout
```

### Flask Service Won't Start

```bash
# Check logs
sudo journalctl -u flaskserver -n 50

# Check if port 5000 is already in use
sudo lsof -i :5000
```

---

## 📚 Reference

- [Orange Pi Official Docs](https://orangepi.org/)
- [wiringOP GitHub](https://github.com/orangepi-xunlong/wiringOP-Python)
- [Modbus TCP Spec](http://www.modbus.org/tech.php)
