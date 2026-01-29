# PLC Remote Control Web

A **cloud-based remote laboratory system** for PID temperature control education.

## 📚 Documentation

Detailed documentation has been moved to the `docs/` folder:

-   **[Setup Guide](docs/SETUP.md)**: Installation, hardware requirements, and deployment instructions.
-   **[Architecture](docs/ARCHITECTURE.md)**: System design, microservices, database schema, and IPC.
-   **[Modbus Register Map](docs/MODBUS_MAP.md)**: **IMPORTANT** - Reference for PLC Programming (Register addresses and Handshakes).

## 🚀 Quick Start (Local Dev)

**Frontend**:
```bash
cd apps/web
npm run dev
```

**Worker**:
```bash
cd services/worker
npx wrangler dev
```
