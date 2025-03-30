# PLC Remote Control Web

This project provides a web-based remote control system for a PLC using **Cloudflare Pages** (frontend), **Cloudflare Workers** (backend API), and optionally **Cloudflare D1** (database) for logging actions. The system allows users to start/stop the PLC remotely and view status updates in real time.

---

## 📌 Features
- **Web Interface**: Simple UI for remote control (HTML, CSS, JavaScript)
- **Cloudflare Worker API**: Backend logic for handling PLC commands
- **Database (Optional)**: Cloudflare D1 for logging actions
- **Secure & Scalable**: Hosted on Cloudflare’s global network

---

## 😁 Project Structure
```
👤 PLC-Remote-Control-Web
 ├── 👤 public/         # Static assets (if needed)
 │   ├── 📄 index.html   # Frontend UI
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
2. Connect your GitHub repository
3. Deploy the frontend

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
   cd plc-worker
   ```
5. Update `worker.js` with API logic
6. Deploy the worker:
   ```sh
   npx wrangler deploy
   ```

### 3️⃣ **Set Up Cloudflare D1 (Database) [Optional]**
1. Create a new D1 database:
   ```sh
   npx wrangler d1 create plc-db
   ```
2. Deploy schema:
   ```sh
   npx wrangler d1 execute plc-db --file=database/schema.sql
   ```

---

## ⚡ API Endpoints (Cloudflare Worker)
| Endpoint        | Method | Description         |
|---------------|--------|---------------------|
| `/start`      | POST   | Starts the PLC      |
| `/stop`       | POST   | Stops the PLC       |

Example usage:
```sh
curl -X POST https://cloud-worker.wongkiinging.workers.dev/start
```

---

## 🖥️ Web Interface
- **index.html**: Basic UI with Start/Stop buttons
- **script.js**: Fetches API endpoints to control the PLC

```js
document.getElementById("start-btn").addEventListener("click", () => {
    fetch("https://cloud-worker.wongkiinging.workers.dev/start", { method: "POST" })
        .then(response => response.json())
        .then(data => document.getElementById("status").textContent = data.message)
        .catch(err => console.error(err));
});
```

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
- ✅ Improve UI with Bootstrap or TailwindCSS
- ✅ Add real-time status updates from PLC
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

