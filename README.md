
# PLC Remote Control Web

A **cloud-based remote laboratory system** for PID temperature control education, built with modern web technologies and edge computing.

## 🏗️ Architecture

### Frontend
* **React + Vite** → Modern SPA with hot module replacement
* **React Bootstrap** → Responsive UI components
* **Chart.js** → Real-time temperature and control trend visualization
* **Cloudflare Pages** → Global CDN deployment

### Backend
* **Cloudflare Workers** → Edge API proxy, session management, and authentication
* **Cloudflare KV** → User credentials and session storage
* **Cloudflare Tunnel** → Secure connection to on-premise hardware

### Hardware
* **Orange Pi 4 Pro (12GB RAM)** → Main gateway server
  * PLC communication (Modbus TCP)
  * MAX31865 RTD temperature acquisition
  * Student file management (lab sheets, booking system)
  * User authentication backend
* **Radxa Zero 3W (4GB RAM)** → Dedicated video streaming server
  * OV5647 camera (5MP)
  * OpenCV + GStreamer pipeline
  * MJPEG streaming over Cloudflare Tunnel

### ✨ Features

#### For Students
* 🎓 **Remote PID Control Lab** - Access real hardware from anywhere
* 📹 **Live Video Feed** - Monitor the physical setup in real-time
* 📊 **Real-time Trends** - Visualize PV, SP, and MV on interactive charts
* 📝 **Lab Sheet Download** - Access experiment instructions and templates
* 📅 **Lab Booking System** - Reserve time slots for experiments
* 🔐 **Secure Login** - Individual student accounts with session management

#### For Instructors
* 👥 **User Management** - Create and manage student accounts
* 📈 **System Monitoring** - View all active sessions and system status
* 🛠️ **Remote Diagnostics** - Check hardware status and logs

#### Control Features
* **Manual Mode** - Direct MV (%) control
* **Auto Mode** - PID control with adjustable parameters (PB, Ti, Td)
* **Auto-Tune Mode** - Automatic PID parameter identification
* **Process Control** - Start/stop light, web interface, and PLC independently
* **Power Management** - Remote relay control for equipment power

---

## 📁 Project Structure

```
PLC-Remote-Control-Web/
├── apps/
│   └── web/                    # React + Vite frontend
│       ├── src/
│       │   ├── pages/          # Dashboard, Login, Signup, Admin
│       │   ├── components/     # TrendChart, etc.
│       │   ├── contexts/       # AuthContext
│       │   └── services/       # API client
│       ├── vite.config.js
│       └── package.json
│
├── services/
│   ├── worker/                 # Cloudflare Worker
│   │   ├── src/
│   │   │   └── worker.js       # API proxy, auth, video streaming
│   │   └── wrangler.toml
│   │
│   ├── Opi4Pro_gateway/        # Orange Pi Flask API
│   │   ├── app.py              # PLC control, temp reading
│   │   ├── modbus_client.py    # Modbus TCP communication
│   │   └── max31865.py         # RTD sensor driver
│   │
│   └── radxa3w_camera/         # Radxa camera service
│       ├── app.py              # Flask video streaming
│       ├── setup.sh            # Environment setup
│       └── camera_app.service  # Systemd service
│
├── wrangler.toml               # Worker + Pages deployment config
└── README.md
```

---

## 🚀 Deployment

### 1️⃣ Frontend (React + Vite)

```bash
cd apps/web
npm install
npm run build
```

The build output (`dist/`) is automatically deployed via Cloudflare Worker's asset serving.

### 2️⃣ Cloudflare Worker

```bash
cd services/worker
npx wrangler deploy
```

This deploys:
- API proxy routes (`/temp`, `/control_status`, `/setpoint`, etc.)
- Authentication endpoints (`/api/login`, `/api/signup`, `/api/session`)
- Video feed proxy (`/video_feed` → `https://cam.plc-web.online`)
- Static asset serving (React app)

### 3️⃣ Orange Pi 4 Pro Gateway

```bash
# On the Orange Pi
cd ~/gateway
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start services
sudo systemctl enable gateway.service
sudo systemctl start gateway.service
```

### 4️⃣ Radxa Zero 3W Camera

```bash
# On the Radxa
cd ~/radxa3w_camera
chmod +x setup.sh
./setup.sh

# Start services
sudo systemctl enable camera_app.service cloudflared.service
sudo systemctl start camera_app.service cloudflared.service
```

---

## 🔄 Request Flow

```
Browser
  ↓
https://plc-web.online (Cloudflare Worker)
  ↓
  ├─→ /api/* → Worker KV (Auth, Session)
  ├─→ /video_feed → cam.plc-web.online (Radxa)
  └─→ /temp, /control_status, etc. → orangepi.plc-web.online (OPi4Pro)
```

---

## ⚡ API Endpoints

### Authentication
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/login` | POST | User login (returns session cookie) |
| `/api/signup` | POST | Create new student account |
| `/api/logout` | POST | End session |
| `/api/session` | GET | Check current session |
| `/api/users` | GET | List all users (admin) |
| `/api/user/delete` | POST | Delete user (admin) |

### PLC Control
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/start_light` | POST | Turn on indicator light |
| `/stop_light` | POST | Turn off indicator light |
| `/start_web` | POST | Enable web control |
| `/stop_web` | POST | Disable web control |
| `/start_plc` | POST | Enable PLC control |
| `/stop_plc` | POST | Disable PLC control |
| `/manual_mode` | POST | Switch to manual mode |
| `/auto_mode` | POST | Switch to auto mode |
| `/tune_mode` | POST | Switch to auto-tune mode |

### Data & Parameters
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/temp` | GET | Get current RTD temperature |
| `/control_status` | GET | Get light/web/plc/mode status |
| `/setpoint` | POST | Set temperature setpoint (°C) |
| `/pid` | POST | Set PID parameters (PB, Ti, Td) |
| `/mv_manual` | POST | Set manual MV (%) |
| `/tune_start` | POST | Start auto-tuning |
| `/tune_stop` | POST | Stop auto-tuning |
| `/tune_status` | GET | Get tuning progress |

### Video & Power
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/video_feed` | GET | MJPEG stream (640x480) |
| `/relay` | GET/POST | Query or control equipment power |

---

## 🎓 Educational Use Case

This system is designed for **remote temperature control laboratories** where students can:

1. **Book a Time Slot** - Reserve equipment access via the booking system
2. **Download Lab Sheet** - Get experiment instructions and data templates
3. **Login** - Access the dashboard with individual credentials
4. **Monitor Setup** - View live video of the physical equipment
5. **Run Experiments** - Control temperature, adjust PID parameters, collect data
6. **Analyze Results** - Export trend data for lab reports

**Instructor Benefits:**
- No physical lab access required (24/7 availability)
- Reduced equipment wear (controlled access)
- Scalable to multiple student groups
- Real-time monitoring of student activity

---

## 🛠️ Development

### Local Frontend Development
```bash
cd apps/web
npm run dev
# Opens http://localhost:5173
# Proxies API requests to production worker
```

### Local Worker Development
```bash
cd services/worker
npx wrangler dev
# Opens http://localhost:8787
# Uses production KV bindings
```

---

## 🔐 Security

- **Session-based authentication** with HTTP-only cookies
- **Basic Auth** on camera stream (username: `radxa`, password: `radxa`)
- **Cloudflare Tunnel** for secure hardware access (no port forwarding)
- **CORS** restricted to `plc-web.online` and `localhost:5173`

---

## 📊 System Requirements

### Orange Pi 4 Pro
- **OS**: Ubuntu 22.04 LTS (ARM64)
- **Python**: 3.10+
- **Dependencies**: Flask, pymodbus, adafruit-circuitpython-max31865

### Radxa Zero 3W
- **OS**: Debian 12 (ARM64)
- **Python**: 3.11+
- **Dependencies**: Flask, OpenCV (with GStreamer), Flask-BasicAuth
- **Camera**: OV5647 (MIPI-CSI)

---

## 🌐 Live Deployment

- **Dashboard**: [https://plc-web.online/dashboard](https://plc-web.online/dashboard)
- **Login**: [https://plc-web.online/login](https://plc-web.online/login)
- **Camera (Direct)**: [https://cam.plc-web.online/video_feed](https://cam.plc-web.online/video_feed)

---

## 📝 License

MIT License - Open source for educational use

---

## 🤝 Contributing

Issues and pull requests are welcome! This project is actively used in industrial automation education.

---

## 📧 Contact

For questions about deployment or educational use, please open a GitHub issue.
