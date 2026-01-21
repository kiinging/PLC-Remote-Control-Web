# 📷 Orange Pi Zero 3 (1GB) — Flask + MAX31865 + Modbus

This project turns an **Orange Pi Zero 3 (1GB)** running **Ubuntu Noble Server (24.04)** into a **control and monitoring hub** for a Siemens S7-1200 PLC.  

It combines three main components that work together through a shared memory store (`shared_data.py`):

### 🔑 Core Files

* **`web_api.py` (Flask REST API)**  
  Exposes a simple HTTP API that the **Cloudflare Worker** calls.  
  - Controls outputs (`/light/on`, `/plc/on`, `/mode/auto`, etc.)  
  - Reads current states (`/control_status`, `/temp`, `/trend`)  
  - Updates control parameters (setpoint, PID values, manual MV).  
  → This is the **bridge between the web frontend and the Orange Pi**.

* **`temp_reading.py` (Sensor Loop)**  
  Continuously samples temperatures from:  
  - **MAX31865** (RTD)  
  - **MAX31855** (thermocouple)  
  Stores readings in shared memory along with a **trend buffer** of PV/MV data for plotting.  
  → This keeps live sensor data available for both the API and Modbus.

* **`modbus_server.py` (Modbus TCP Bridge)**  
  Runs a Modbus TCP server (port `1502`) so the **PLC can read/write data**.  
  - Publishes temperature readings, setpoint, and control states via **Input Registers (IR)**  
  - Accepts setpoints, MV values, and sensor selection via **Holding Registers (HR)**  
  → This is the **bridge between the PLC and the Orange Pi**.

---

✅ With these three services:  
- The **web app** (via Cloudflare Worker) can turn things ON/OFF, tune parameters, and visualize trends.  
- The **PLC** can read live process values and write control commands over Modbus.  
- The **Orange Pi** ties everything together, acting as both a **data concentrator** and a **control interface**.

---


### 📂 Project Structure

```
flask-orangepi-temp/
├── web_api.py         ← Flask API for LED control (via Cloudflare Worker)
├── temp_reading.py    ← Reads temps from MAX31865 & MAX31855
├── modbus_server.py   ← Exposes shared data via Modbus TCP (for PLC/NJ301)
├── shared_data.py     ← Global variable store (temperatures, states, etc.)
├── run_all.sh         ← Startup script (launches all services)
├── main.py            ← Orchestrator; runs API, reader, and Modbus server
└── requirements.txt   ← Python dependencies
```

---

# 🚀 PART 1: Quick start
### 1️⃣ Clone the repos & install deps

```bash
git clone https://github.com/kiinging/flask-orangepi-temp.git
cd flask-orangepi-temp
```


### 2️⃣ Run the setup script
```bash
chmod +x setup.sh
./setup.sh
```
This will:

* Install system packages
* Create a Python virtual environment (PEP 668 compliant)
* Install all dependencies inside the venv



## 🧪 Testing
<img src="./src/zero3_pinout.png" alt="Orange Pi Zero3 Pinout" width="80%">

* **Test blink only**:
```bash
source venv/bin/activate
sudo /home/orangepi/venv/bin/python /home/orangepi/flask-orangeapi-temp/test/blink.py
```


⚠️ **Note:** On Ubuntu, GPIO scripts (e.g. `blink.py`) need root *and* your venv’s Python, so `sudo` must be told which Python to run 😵‍💫.


## 🔹 Flask API (Orangepi Web API)

The Flask server exposes endpoints that the **Cloudflare Worker** calls.

### Example: `web_api.py`

```python
@app.route('/light/on', methods=['POST'])
def turn_led_on():
    GPIO.output(LED_PIN, GPIO.HIGH)
    return "LED Turned ON", 200

@app.route('/light/off', methods=['POST'])
def turn_led_off():
    GPIO.output(LED_PIN, GPIO.LOW)
    return "LED Turned OFF", 200

@app.route('/temp', methods=['GET'])
def get_temperature():
    return jsonify({
        "rtd_temp": data.get("rtd_temp"),
        "thermo_temp": data.get("thermo_temp"),
        "internal_temp": data.get("internal_temp"),
        "fault": data.get("fault"),
        "last_update": data.get("last_update"),
    })
```

### Current API Capabilities

* **LED Control** → `/light/on`, `/light/off`
* **Temperature Data** → `/temp` (RTD, thermocouple, internal, fault, timestamp)
* **PLC Control** → `/plc/on`, `/plc/off`
* **Setpoints** → `/setpoint` (GET/POST)
* **PID Params** → `/pid` (GET/POST)
* **Trend Data** → `/trend`
* **Video Feed Proxy** → `/video_feed`

---

## 🔹 Cloudflare Worker (Backend Proxy)

Your Worker acts as a **secure middle layer** between the browser and your Orange Pi.

Example from `worker.js`:

```js
if (url.pathname === '/start_light') {
  const response = await fetch("https://orangepi.plc-web.online/light/on", {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return new Response(await response.text(), {
    status: response.status,
    headers: corsHeaders,
  });
}
```

* Accepts requests from **plc-web.online** frontend
* Adds **CORS headers**
* Forwards traffic to `https://orangepi.plc-web.online/...`
* Returns results to the browser

---

## 🔹 System Management

### Restart after code change

```bash
sudo systemctl restart flaskserver
```

### Check live logs

```bash
sudo journalctl -u flaskserver -f
```

### Stop the service

```bash
sudo systemctl stop flaskserver
```

---

## 🔹 Cloudflare Tunnel Setup

Route traffic from Cloudflare → Flask once:

```bash
cloudflared tunnel route dns orangepi_tunnel orange.plc-web.online
```

Start tunnel after reboot:

```bash
cloudflared tunnel token orangepi_tunnel
sudo cloudflared tunnel run orangepi_tunnel
```

Test:

```bash
curl -X POST https://orangepi.plc-web.online/led/on
```


## 🚀 PART 2: Auto-Start Services on OrangePi

This project uses **systemd** services to automatically run:

* **Flask API Service** (`flaskserver.service`) →
  Starts the **sensor reading loop** (`temp_reading.py`) and the **Flask API** (`web_api.py`).
* **Cloudflare Tunnel Service** (`cloudflared.service`) →
  Keeps the secure tunnel alive after reboot.

Both service files are already included in the repo.
After cloning, just copy them into the systemd directory:

```bash
# From inside the cloned repo
sudo cp flaskserver.service /etc/systemd/system/
sudo cp cloudflared.service /etc/systemd/system/
```

### Enable and start at boot

```bash
sudo systemctl enable flaskserver cloudflared
sudo systemctl start flaskserver cloudflared
```

---

### 🔧 Service Management

```bash
# Restart after making code changes
sudo systemctl restart flaskserver

# View logs (live)
sudo journalctl -u flaskserver -f

# Stop service
sudo systemctl stop flaskserver
```

---

✅ With this setup:

* Your Orange Pi will **auto-start** the Flask API + Cloudflare Tunnel on boot.
* If the Pi reboots, your backend will reconnect automatically.

---
## 🚀 PART 3: Modbus TCP on OrangePi

The orangepi also communicate with PLC through modbus TCP, through temp_reading.py code. This code read temperature from MAX31865 then store in a commom share data. It then send the shared data to PLC including the plc status and temperature.

i use IR for sending variables


### 🔹 1. Difference between IR and HR in Modbus

* **Input Registers (IR, function code `0x04`)** → **Read-only** registers, PLC can only **read** values (like sensor measurements).
* **Holding Registers (HR, function code `0x03`)** → **Read/Write** registers, PLC can **read** or **write** values (good for commands, setpoints, modes).

👉 Since you want to **send status (mode, plc)** from OrangePi to PLC, **use Input Registers (IR)** if PLC only reads them.
👉 If PLC should also be able to change them, then **use Holding Registers (HR)**.

From my case:

* **Temperatures** → IR ✅ (already done).
* **Mode & PLC status** → IR is fine if PLC only reads. 
---

### 🔹 4. Register mapping (for PLC side)

With the above, your **Input Registers (IR)** will look like this:

| Register (IR) | Value                    |
| ------------- | ------------------------ |
| IR0, IR1      | Thermocouple (float)     |
| IR2, IR3      | setpoint (float)         |
| IR4, IR5      | RTD (float)              |
| IR6           | Mode (0=Manual, 1=Auto)  |
| IR7           | PLC Status (0=Off, 1=On) |
| IR8           | online (0=HMI, 1=Web) |


---


## 🔹 Useful Commands

```bash
lscpu
free -h
df -h
lsblk
ssh-keygen -R 192.168.1.xx
cat /proc/meminfo | grep MemTotal
cat /etc/os-release
ls /dev/spi*

# Check Wi-Fi
iw dev wlan0 link
ip a show wlan0
```

---

## 🔹 Debugging

```bash
sudo systemctl restart flaskserver.service
tail -f mv_log.txt
journalctl -u cloudflared -f
```

---
## 📚 Reference

* Orange Pi Zero 3 Ubuntu server: [🔗 Orangepi webpage](https://fusion-automate.notion.site/Orange-Pi-165e22c060cf8080b61fd17102fd2562)

---