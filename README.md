# PLC Remote Control Web

A **cloud-based remote laboratory system** for PID temperature control education.

## 📚 Documentation

Detailed documentation has been moved to the `docs/` folder:

-   **[Setup Guide](docs/SETUP.md)**: Installation, hardware requirements, and deployment instructions.
-   **[Architecture](docs/ARCHITECTURE.md)**: System design, microservices, database schema, and IPC.
-   **[Modbus Register Map](docs/MODBUS_MAP.md)**: **IMPORTANT** - Reference for PLC Programming (Register addresses and Handshakes).

---

## 🔐 Security Architecture (Three-Layer Model)

The system uses three independent security layers so that **only logged-in users can control the PLC**, while keeping the login process easy (no email inbox verification required).

```
Browser  ──[Supabase JWT]──▶  Cloudflare Worker  ──[X-Worker-Secret]──▶  Orange Pi Gateway
```

| Layer | Where | What it does |
|---|---|---|
| **1. Supabase JWT** | Browser → Worker | Supabase issues a cryptographic token on login. Worker verifies it on every command request. |
| **2. Session Cookie** | Browser ↔ Worker | Worker stores the JWT in a secure HttpOnly cookie so the browser doesn't re-send it in the URL. |
| **3. Gateway Secret** | Worker → Orange Pi | All Worker→Pi HTTP calls include a secret header. The Pi rejects any request without it. |

### 📖 Key Design Decision: Easy Login for Students

- Email **confirmation is disabled** in Supabase (see step below).
- Students can sign up with **any email** (even fake) and **any password** — no inbox check needed.
- Security comes from the JWT being **cryptographically verified**, not from email ownership.

---

## 🚀 How to Build & Deploy

### Step 1 — Supabase: Disable Email Confirmation

> Do this once. Without it, new student accounts will be stuck waiting for an email.

1. Open your [Supabase Dashboard](https://supabase.com/dashboard)
2. Go to **Authentication → Settings**
3. Under **Email Auth**, turn OFF **"Confirm email"**
4. Save changes.

Students can now sign up instantly with any email and any password.

---

### Step 2 — Generate a Gateway Secret

Pick any long random string as your shared secret. You can generate one:

```bash
# On any terminal (PowerShell, Linux, macOS)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Example output: `a3f8c1e2b4d5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1`

Keep this value — you will use it in **both** Step 3 and Step 4.

---

### Step 3 — Add Secrets to Cloudflare Worker

Run these commands from the project root:

```bash
# Supabase anonymous key (from Supabase Dashboard → Settings → API)
npx wrangler secret put SUPABASE_ANON_KEY

# The gateway secret you generated in Step 2
npx wrangler secret put GATEWAY_SECRET
```

Wrangler will prompt you to paste each value. These are stored encrypted in Cloudflare — never in your code.

> **Note:** `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` should already be set.
> Verify with: `npx wrangler secret list`

---

### Step 4 — Set the Secret on the Orange Pi Gateway

SSH into the Orange Pi and add the secret to the gateway systemd service:

```bash
sudo systemctl edit gateway-api.service
```

In the editor that opens, add:

```ini
[Service]
Environment="GATEWAY_SECRET=<paste-your-secret-here>"
```

Then reload and restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart gateway-api.service
```

To verify it's working, try to POST to any command endpoint directly (bypassing the Worker). You should get `403 Forbidden`:

```bash
curl -X POST https://orangepi.pidlab2026.shop/plc/on
# Expected: {"error": "Forbidden: invalid or missing worker secret"}
```

---

### Step 5 — Build the Frontend

```bash
cd apps\web
npm run build
```

---

### Step 6 — Deploy the Worker

```bash
cd \PLC-Remote-Control-Web
npx wrangler deploy
```

---

## ✅ Security Checklist

- [ ] Email confirmation disabled in Supabase
- [ ] `SUPABASE_ANON_KEY` set in Cloudflare Worker secrets
- [ ] `GATEWAY_SECRET` set in Cloudflare Worker secrets
- [ ] `GATEWAY_SECRET` environment variable set on Orange Pi (`gateway-api.service`)
- [ ] Direct POST to `orangepi.pidlab2026.shop` returns `403`
- [ ] Unauthenticated POST to `pidlab2026.shop/api/plc/on` returns `401`
- [ ] Logged-in student can control the lab normally ✅

