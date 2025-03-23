# PLC Remote Control Web

This project provides a web-based remote control system for a PLC using **Cloudflare Pages** (frontend), **Cloudflare Workers** (backend API), and optionally **Cloudflare D1** (database) for logging actions. The system allows users to start/stop the PLC remotely and view status updates in real time.

---

## 📌 Features
- **Web Interface**: Simple UI for remote control (HTML, CSS, JavaScript)
- **Cloudflare Worker API**: Backend logic for handling PLC commands
- **Database (Optional)**: Cloudflare D1 for logging actions
- **Secure & Scalable**: Hosted on Cloudflare’s global network

---

## 📁 Project Structure
```
📂 PLC-Remote-Control-Web
 ├── 📂 public/         # Static assets (if needed)
 │   ├── 📄 index.html   # Frontend UI
 │   ├── 📄 styles.css   # CSS for styling
 │   ├── 📄 script.js    # JavaScript logic
 │
 ├── 📂 worker/        # Cloudflare Worker backend
 │   ├── 📄 worker.js    # Backend API logic
 │   ├── 📄 wrangler.toml # Cloudflare Worker config
 │
 ├── 📂 database/      # Optional database setup
 │   ├── 📄 schema.sql   # SQL for Cloudflare D1
 │   ├── 📄 seed.sql     # Initial test data
 │
 ├── 📄 README.md      # Documentation
```

---

## 🚀 Getting Started

### 1️⃣ **Set Up Cloudflare Pages (Frontend)**
1. Go to [Cloudflare Pages](https://pages.cloudflare.com/)
2. Connect your GitHub repository
3. Deploy the frontend

### 2️⃣ **Deploy Cloudflare Worker (Backend API)**
1. Install [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
2. Initialize a worker project:
   ```bash
   wrangler init plc-worker
   ```
3. Update `worker.js` with API logic
4. Deploy the worker:
   ```bash
   wrangler deploy
   ```

### 3️⃣ **Set Up Cloudflare D1 (Database) [Optional]**
1. Create a new D1 database:
   ```bash
   wrangler d1 create plc-db
   ```
2. Deploy schema:
   ```bash
   wrangler d1 execute plc-db --file=database/schema.sql
   ```

---

## ⚡ API Endpoints (Cloudflare Worker)
| Endpoint        | Method | Description         |
|---------------|--------|---------------------|
| `/start`      | POST   | Starts the PLC      |
| `/stop`       | POST   | Stops the PLC       |

Example usage:
```bash
curl -X POST https://your-worker-url.workers.dev/start
```

---

## 🖥️ Web Interface
- **index.html**: Basic UI with Start/Stop buttons
- **script.js**: Fetches API endpoints to control the PLC

```js
document.getElementById("start-btn").addEventListener("click", () => {
    fetch("https://your-worker-url.workers.dev/start", { method: "POST" })
        .then(response => response.json())
        .then(data => document.getElementById("status").textContent = data.message)
        .catch(err => console.error(err));
});
```

---

## 📌 Next Steps
- ✅ Improve UI with Bootstrap or TailwindCSS
- ✅ Add real-time status updates from PLC
- ✅ Secure API endpoints with authentication
- ✅ Store logs in Cloudflare D1

---

## 📜 License
This project is open-source under the MIT License.

---

## 📞 Contact
If you have questions or suggestions, feel free to open an issue on GitHub!

