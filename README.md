
# PLC Remote Control Web

This project provides a **web-based PID heater control and monitoring system** for a PLC, built with:

* **Cloudflare Pages** → Frontend (HTML, JavaScript, Bootstrap, Chart.js)
* **Cloudflare Workers** → Backend API & proxy layer
* **Orange Pi Zero 3 (1GB)** → Runs the Flask API and handles all PLC control & monitoring
* **Optional Cloudflare D1** → For logging and storing historical data
* **Raspberry Pi Zero 2 W Security Camera** → Separate [camera repo](https://github.com/kiinging/flask_cam) (Flask + Picamera2) used for **live video streaming**

### ✨ Features

* Start/stop PLC and lights
* Send setpoints and PID parameters
* Real-time temperature monitoring
* Historical trend visualization
* Optional secure live camera feed (via Pi Zero 2 W + Cloudflare Tunnel)

---

---
## 🔄 How Requests Flow

1. **Frontend (Browser → Worker)**
   The browser always talks to:

   ```
   https://cloud-worker.wongkiinging.workers.dev
   ```
   with a specific **pathname**.

   Example:

   * `/start_light` → Turn on light
   * `/stop_light` → Turn off light
   * `/start_plc` → Start PLC heater
   * `/stop_plc` → Stop PLC heater
   * `/setpoint` → Send new temperature setpoint
   * `/pid` → Send new PID parameters
   * `/temp` → Get current RTD temperature
   * `/trend` → Get PV/MV trend data
   * `/video_feed` → Live MJPEG camera feed

2. **Worker (Proxy → Backends)**
   - Based on the pathname, the Worker forwards the request to the right backend:
     - `orangepi.plc-web.online` → PLC commands + temperature
     - `cam.plc-web.online` → Live camera feed
---

## 📌 Features

* **Web Interface**

  * Start/stop PLC and light
  * Manual/Auto mode selection
  * Send **setpoint** and **PID parameters (Kp, Ti, Td)**
  * View **real-time temperature** and **update timestamps**
  * Display **PV (°C)** and **MV (%)** trends in Chart.js
  * Live video stream of the system

* **Cloudflare Worker API**

  * Secure proxy between web frontend and backend servers
  * Adds CORS headers for browser requests

* **Optional Database**

  * Use Cloudflare D1 to log operator actions or temperature history

---

## 😁 Project Structure
```
👤 PLC-Remote-Control-Web
 ├── 👤 public/         # Static assets (if needed)
 │   ├── 📄 dashboard.html   # Frontend UI
 │   ├── 📄 styles.css   # CSS for styling
 │   └── 📄 script.js    # JavaScript logic
 │
 ├── 👤 worker/        # Cloudflare Worker backend
 │   ├── 📄 worker.js    # Backend API logic
 │   └── 📄 wrangler.toml # Cloudflare Worker config
 │
 ├── 👤 database/      # Optional database setup
 │   ├── 📄 schema.sql   # SQL for Cloudflare D1
 │   └── 📄 seed.sql     # Initial test data
 │
 └── 📄 README.md      # Documentation
```

---

## 🚀 Getting Started

### 1️⃣ **Set Up Cloudflare Pages (Frontend)**

1. Go to [Cloudflare Pages](https://pages.cloudflare.com/)
2. Connect your **GitHub repository** containing `dashboard.html`, `script.js`, and other static files
3. Cloudflare Pages will automatically build and deploy your frontend
4. **Updating the frontend:**

   * Make changes locally (e.g., edit `index.html` in VS Code)
   * Run `git commit` and `git push`
   * Cloudflare Pages will automatically detect the push and redeploy the site — no manual action required


### 2️⃣ **Deploy Cloudflare Worker (Backend API)**
1. Install [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/):
   ```sh
   npm install -g wrangler
   ```
2. Log in to Cloudflare:
   ```sh
   npx wrangler login
   ```
3. Initialize a worker project:
   ```sh
   wrangler init plc-worker
   ```
4. Navigate to the worker directory:
   ```sh
   cd worker
   ```
5. Update `worker.js` with API logic
6. Deploy the worker:
   ```sh
   npx wrangler deploy
   ```

### 3️⃣ **Set Up Cloudflare D1 (Database) [underconstruction]**
1. Create a new D1 database:
   ```sh
   npx wrangler d1 create plc-db
   ```
2. Deploy schema:
   ```sh
   npx wrangler d1 execute plc-db --file=database/schema.sql
   ```

### 4️⃣ **Backend (OrangePi / Raspberry Pi)**

Run a Flask (or similar) HTTP API to actually control PLC hardware.

---

## ⚡ API Endpoints

| Endpoint       | Method | Description                    |
| -------------- | ------ | ------------------------------ |
| `/start_light` | POST   | Turn on the light              |
| `/stop_light`  | POST   | Turn off the light             |
| `/start_plc`   | POST   | Start PLC heater               |
| `/stop_plc`    | POST   | Stop PLC heater                |
| `/temp`        | GET    | Get RTD temperature            |
| `/trend`       | GET    | Get PV/MV historical data      |
| `/setpoint`    | POST   | Update setpoint (°C)           |
| `/pid`         | POST   | Update PID params (Kp, Ti, Td) |
| `/video_feed`  | GET    | Live MJPEG camera feed         |

---
## 🖥️ Web Interface

The frontend uses **Bootstrap 5 + Chart.js** for a responsive UI.

* Control panel with Start/Stop buttons and mode selection
* Input fields for Setpoint, Kp, Ti, Td
* Trend chart showing **PV vs MV**
* Live video feed

---


## 💀 Useful Wrangler CLI Commands
| Command | Description |
|---------|-------------|
| `npx wrangler login` | Authenticate Wrangler with Cloudflare |
| `npx wrangler init` | Initialize a new Worker project |
| `npx wrangler dev` | Run Worker locally at `http://localhost:8787/` |
| `npx wrangler deploy` | Deploy the Worker to Cloudflare |
| `npx wrangler tail` | View real-time logs of Worker requests |
| `npx wrangler d1 create <db-name>` | Create a Cloudflare D1 database |
| `npx wrangler d1 execute <db-name> --file=<schema.sql>` | Apply SQL schema to D1 |

---

## 💪 Next Steps
- ✅ Secure API endpoints with authentication
- ✅ Store logs in Cloudflare D1

---

## 💽 License
This project is open-source under the MIT License.

---

## 📲 Contact
If you have questions or suggestions, feel free to open an issue on GitHub!

---

## 🏠 Live Deployment Links
- **Web Interface:** [https://cloud-ui-4ws.pages.dev/](https://cloud-ui-4ws.pages.dev/)
- **Worker API:** [https://cloud-worker.wongkiinging.workers.dev/](https://cloud-worker.wongkiinging.workers.dev/)


# Remote PLC Control Using Raspberry Pi, Flask, and Cloudflare Workers

This guide provides a novice-friendly approach to remotely control a Programmable Logic Controller (PLC) using a Raspberry Pi as an intermediary. By implementing an HTTP server on the Raspberry Pi with Flask and integrating it with Cloudflare Workers, you can securely send start and stop commands to your PLC from a web interface.

---
