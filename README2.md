# PLC Remote Control Web

This project provides a **web-based PID heater control system** for a PLC using:

* **Cloudflare Pages** → Frontend (HTML, JS, Bootstrap, Chart.js)
* **Cloudflare Workers** → Backend API & proxy
* **OrangePi/Raspberry Pi (Flask API)** → PLC hardware interface
* **Optional Cloudflare D1** → Store logs or historical data

Users can **start/stop lights & PLC**, send **setpoints and PID parameters**, and monitor **real-time temperature and trends**.

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

   * `orangepi.plc-web.online` → PLC control + temperature + trend + setpoint/PID
   * `cam.plc-web.online` → Camera feed

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






## 🚀 Getting Started

### 1. Frontend (Cloudflare Pages)

Deploy `index.html`, `script.js`, and static assets to **Cloudflare Pages**.

### 2. Worker (Cloudflare Workers)

Deploy `worker.js` with your proxy API logic:

```sh
npx wrangler deploy
```

### 3. Backend (OrangePi / Raspberry Pi)

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

## ⚠️ Important Note

Currently, the **browser does NOT auto-fetch the current setpoint and PID parameters from the PLC** when you load/refresh the page.

* It only auto-fetches **temperature** and **trend data**.
* Setpoint/PID values must be **entered manually** unless you implement a `GET /pid` (or similar) endpoint and call it on page load.

---

## 🏠 Live Deployment Links

* **Web Interface:** [https://cloud-ui-4ws.pages.dev/](https://cloud-ui-4ws.pages.dev/)
* **Worker API:** [https://cloud-worker.wongkiinging.workers.dev/](https://cloud-worker.wongkiinging.workers.dev/)

---

Would you like me to **add code for `GET /pid` + `GET /setpoint`** in your worker & `script.js` so that the browser automatically populates those fields on load? That way, when you refresh, it fetches the *actual PLC parameters* immediately.
