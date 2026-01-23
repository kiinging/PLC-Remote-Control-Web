# Flask API Testing Guide

## Overview

This folder contains test scripts and tools to validate the Flask API server running on Orange Pi 4 Pro.

### What the Three Processes Mean

```
Main PID: 7615 (bash)                    ← run_all.sh script
  ├─7618 python main.py                  ← Modbus TCP server + Flask API
  └─7619 python main.py                  ← Duplicate process
```

**Yes, your Flask server is running! ✓**

The three processes indicate:
1. **bash (7615)**: The `run_all.sh` script that launches everything
2. **python (7618 & 7619)**: Two instances of `main.py` (one should suffice, but both are running)

The Flask API is listening on `http://0.0.0.0:5000` and ready for requests.

---

## Testing Methods

### Method 1: Browser-Based Testing (Easiest) 🌐

**File:** `gateway_monitor.html`

#### Step 1: Start Flask Server
```bash
# The service is already running, OR manually start:
sudo systemctl start flaskserver

# Verify it's running:
sudo systemctl status flaskserver
```

#### Step 2: Find Your Orange Pi IP Address
```bash
hostname -I
# Example output: 192.168.8.134
```

#### Step 3: Open in Browser
```
Open your browser and visit:
http://192.168.8.134:5000/test/gateway_monitor.html
```

Or if you want to serve from a different port:
```bash
# From the test/ folder:
cd /home/orangepi/opi4pro_gateway/test
python3 -m http.server 8000

# Then open: http://192.168.8.134:8000/gateway_monitor.html
```

#### What You'll See:
- 🟢 **Green indicator** = Gateway is ONLINE and responding to heartbeats
- 🔴 **Red indicator** = Gateway is OFFLINE (no heartbeat for 10+ seconds)
- **LED ON/OFF buttons** = Control the LED on pin 10 (PL2, physical pin 18)
- **Status display** = Shows LED state, PLC state, and current mode
- **Console log** = Real-time events with timestamps

#### Interactive Testing:
1. **Click "LED ON"** → LED on Orange Pi lights up ✓
2. **Click "LED OFF"** → LED turns off ✓
3. **Watch heartbeat** → Updates every 2 seconds
4. **Stop the Flask service** → Status indicator turns red within 10 seconds

---

### Method 2: Command-Line Testing (Detailed) 🖥️

**File:** `test_flask.py`

#### Step 1: Start Flask Server (if not already running)
```bash
sudo systemctl start flaskserver
```

#### Step 2: Run the Test Script
```bash
cd /home/orangepi/opi4pro_gateway
source venv/bin/activate
sudo ./venv/bin/python test/test_flask.py
```

#### Expected Output:
```
[12:34:56] Starting gateway monitor...
[12:34:56] Monitor ready
[12:34:56] Heartbeat: light=0, plc=0
[12:34:58] Heartbeat: light=0, plc=0
[12:34:59] 💓 Gateway ONLINE ✓
[12:35:00] Testing LED ON...
[12:35:00] LED ON - Response: {'light': 1}
[12:35:02] Heartbeat: light=1, plc=0
[12:35:04] Testing LED OFF...
[12:35:04] LED OFF - Response: {'light': 0}
```

#### What It Tests:
- ✓ Heartbeat polling (every 2 seconds)
- ✓ Gateway status detection (online/offline)
- ✓ LED ON control via POST `/light/on`
- ✓ LED OFF control via POST `/light/off`
- ✓ Status updates from API response

#### Press `Ctrl+C` to Stop
The script runs continuously. Press `Ctrl+C` to exit.

---

### Method 3: Direct cURL Testing (For Debugging) 🔧

#### Test Heartbeat Endpoint
```bash
curl -X GET http://192.168.8.134:5000/heartbeat
```

**Response:**
```json
{
  "status": "alive",
  "timestamp": 1674433456.123,
  "light": 0,
  "plc": 0,
  "mode": 0
}
```

#### Control LED ON
```bash
curl -X POST http://192.168.8.134:5000/light/on
```

#### Control LED OFF
```bash
curl -X POST http://192.168.8.134:5000/light/off
```

#### Get Temperature
```bash
curl -X GET http://192.168.8.134:5000/temp
```

#### Get Trend Data (Last 450 samples)
```bash
curl -X GET http://192.168.8.134:5000/trend
```

---

## Test Files Reference

| File | Purpose | How to Run |
|------|---------|-----------|
| `gateway_monitor.html` | Browser-based real-time dashboard | Open in browser at `http://[IP]:5000/test/gateway_monitor.html` |
| `test_flask.py` | Command-line heartbeat + LED tester | `sudo ./venv/bin/python test/test_flask.py` |
| `test_blink.py` | Test LED blink (simple GPIO test) | `sudo ./venv/bin/python test/test_blink.py` |
| `test_max31865.py` | Test MAX31865 RTD sensor | `sudo ./venv/bin/python test/test_max31865.py` |

---

## Troubleshooting

### ❌ "Connection refused" error
```bash
# Flask server not running
sudo systemctl start flaskserver

# Check status:
sudo systemctl status flaskserver

# View recent logs:
sudo journalctl -u flaskserver -n 20
```

### ❌ "Permission denied" error
```bash
# Must use sudo with wiringpi (GPIO access)
sudo ./venv/bin/python test/test_flask.py
```

### ❌ "No module named 'wiringpi'" error
```bash
# Reinstall wiringpi from source:
cd /home/orangepi/opi4pro_gateway
./setup.sh
```

### ❌ LED doesn't turn on/off
```bash
# Check GPIO pin configuration:
gpio readall

# Verify wPi pin 10 is correct (physical pin 18, PL2)
# If not, update LIGHT_PIN in web_api.py
```

### ❌ Gateway shows OFFLINE in browser monitor
```bash
# Check Flask is actually listening on port 5000:
sudo netstat -tuln | grep 5000

# Should show:
# tcp        0      0 0.0.0.0:5000            0.0.0.0:*               LISTEN

# If not, restart the service:
sudo systemctl restart flaskserver
```

### ❌ Browser can't reach `http://192.168.8.134:5000`
```bash
# Check your Orange Pi IP address:
hostname -I

# Ping from your computer:
ping 192.168.8.134

# Make sure firewall isn't blocking port 5000:
sudo ufw allow 5000/tcp
```

---

## Complete Testing Workflow

### Full System Test (5-10 minutes)

1. **Verify service is running:**
   ```bash
   sudo systemctl status flaskserver
   ```

2. **Test with browser (Easiest):**
   ```
   Open: http://192.168.8.134:5000/test/gateway_monitor.html
   - Watch status indicator turn GREEN
   - Click LED ON → LED turns on ✓
   - Click LED OFF → LED turns off ✓
   - Stop service → Status turns RED within 10s ✓
   ```

3. **Test with command-line (Detailed logging):**
   ```bash
   sudo ./venv/bin/python test/test_flask.py
   # Watch heartbeat, LED control, and status changes
   ```

4. **Test individual endpoints (Debug):**
   ```bash
   curl -X GET http://192.168.8.134:5000/heartbeat
   curl -X POST http://192.168.8.134:5000/light/on
   curl -X GET http://192.168.8.134:5000/temp
   ```

5. **Check service logs:**
   ```bash
   sudo journalctl -u flaskserver -f
   ```

---

## API Endpoints Summary

### Core Endpoints

| Endpoint | Method | Purpose | Example |
|----------|--------|---------|---------|
| `/heartbeat` | GET | Check if gateway is alive | `curl http://[IP]:5000/heartbeat` |
| `/light/on` | POST | Turn LED ON | `curl -X POST http://[IP]:5000/light/on` |
| `/light/off` | POST | Turn LED OFF | `curl -X POST http://[IP]:5000/light/off` |
| `/temp` | GET | Get current temperature | `curl http://[IP]:5000/temp` |
| `/trend` | GET | Get last 450 temperature samples | `curl http://[IP]:5000/trend` |
| `/control_status` | GET | Get light/plc/web/mode state | `curl http://[IP]:5000/control_status` |

### Control Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/plc/on` | POST | Enable PLC |
| `/plc/off` | POST | Disable PLC |
| `/mode/manual` | POST | Set Manual mode |
| `/mode/auto` | POST | Set Auto mode |
| `/mode/tune` | POST | Set Tune mode |

---

## Next Steps

- ✅ Test basic LED control with `gateway_monitor.html`
- ✅ Verify heartbeat mechanism with `test_flask.py`
- ⏭️ Connect MAX31855 thermocouple sensor
- ⏭️ Test temperature reading endpoints
- ⏭️ Integrate PLC via Modbus TCP
- ⏭️ Test Cloudflare Tunnel remote access

---

## Notes

- **Flask server listens on:** `0.0.0.0:5000` (all interfaces)
- **Heartbeat timeout:** 10 seconds (no response = gateway marked offline)
- **Heartbeat poll interval:** 2 seconds (browser checks every 2s)
- **LED GPIO pin:** wPi 10 (physical pin 18, PL2)
- **Always use sudo:** GPIO access requires root privileges

For more details, see `/home/orangepi/opi4pro_gateway/Readme.md`
