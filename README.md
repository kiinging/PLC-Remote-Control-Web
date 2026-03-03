# PLC Remote Control Web

A **cloud-based remote laboratory system** for PID temperature control education.

## 📚 Documentation

Detailed documentation has been moved to the `docs/` folder:

-   **[Setup Guide](docs/SETUP.md)**: Installation, hardware requirements, and deployment instructions.
-   **[Architecture](docs/ARCHITECTURE.md)**: System design, microservices, database schema, and IPC.
-   **[Modbus Register Map](docs/MODBUS_MAP.md)**: **IMPORTANT** - Reference for PLC Programming (Register addresses and Handshakes).

## 🚀 How to Build & Deploy

**Step 1 — Build the frontend**:
```bash
cd apps\web
npm run build
```

**Step 2 — Deploy the worker**:
```bash
cd \PLC-Remote-Control-Web
npx wrangler deploy
```
