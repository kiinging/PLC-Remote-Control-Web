# Setup & Installation Guide

## 1. Hardware Requirements
-   **Orange Pi 4 Pro** (Gateway) - Ubuntu 22.04
-   **Radxa Zero 3W** (Camera) - Debian 12
-   **ESP32-S3** (Smart Relay)

## 2. Orange Pi Gateway Setup

### Prerequisites
Enable SPI and GPIO access.
```bash
sudo apt update
sudo apt install python3-pip wiringpi
```

### Installation
1.  Clone the repository to `~/gateway`.
2.  Install dependencies:
    ```bash
    cd services/opi4pro_gateway
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    ```
3.  Install Systemd Services:
    -   Copy `*.service` files to `/etc/systemd/system/`.
    -   Reload and enable:
        ```bash
        sudo systemctl daemon-reload
        sudo systemctl enable gateway-api gateway-modbus gateway-sensor gateway-relay
        sudo systemctl start gateway-api gateway-modbus gateway-sensor gateway-relay
        ```

## 3. Cloudflare Worker Setup
The project uses Cloudflare Workers for the public API and auth.

```bash
cd services/worker
npm install
npx wrangler deploy
```

## 4. Frontend Setup
The frontend is a React SPA.

```bash
cd apps/web
npm install
npm run build
# Deploy via Cloudflare Pages or serve statically
```

## 5. Key Management (Cloudflare KV)
**Namespace**: `USERS`

To manage users, navigate to the Cloudflare Dashboard > Workers > KV.
-   Key: `user:<username>`
-   Value: `{"password": "<password>"}`

*(Note: Wrangler CLI v4 no longer supports direct KV operations. Use the Dashboard or Worker API.)*
