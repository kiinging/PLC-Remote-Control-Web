# Gateway Architecture & Technical Reference

This document details the technical design of the **Orange Pi 4 Pro Gateway**, which operates as a set of **4 independent microservices** coordinated via a local **SQLite database**.

## System Overview

The system is decoupled into separate processes, managed by `systemd`. This ensures that a failure in one component (e.g., Modbus) does not affect others (e.g., Web API).

| Service | Filename | Description | Privileges |
| :--- | :--- | :--- | :--- |
| **API** | `run_api.py` | Flask Web Server (Port 5000). Serves frontend & handles command logic. | `root` (GPIO) |
| **Sensor** | `run_sensor.py` | Reads MAX31865/MAX31855 via SPI. Logs to DB. | `root` (SPI/GPIO) |
| **Relay** | `run_relay.py` | Polls/Controls ESP32 Smart Relay via HTTP. | `root` |
| **Modbus** | `run_modbus.py` | Modbus TCP Server (Port 1502). Bridges PLC <-> DB. | `root` |

**Why Root?**  
All services run as `root` to allow direct access to `/dev/mem` for the `wiringpi` library (required for high-speed GPIO/SPI toggle on Orange Pi).

---

## Inter-Process Communication (IPC)

All services share state using a local SQLite database file:
- **Path**: `/var/lib/opi4pro_gateway/gateway.db`
- **Mode**: Write-Ahead Logging (WAL) enabled for high concurrency.
- **Access**: Each service opens its own connection.

### Database Schema

#### 1. `state` Table
Stores the **latest value** for every system variable. Acts like a Key-Value store.

```sql
CREATE TABLE state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,  -- JSON encoded string
  updated_at INTEGER NOT NULL
);
```

**Common Keys:**
- **Sensors**: `rtd_temp` (float), `sensor_last_ts` (timestamp)
- **Control**: `setpoint` (float), `mv` (float), `mode` (int: 0=Manual, 1=Auto, 2=Tune)
- **PID**: `pid_pb`, `pid_ti`, `pid_td`
- **System**: `light` (0/1), `power_on` (0/1), `esp32_connected` (bool)

#### 2. `trend` Table
Stores historical data for Frontend Charts.

```sql
CREATE TABLE trend (
  ts INTEGER NOT NULL,  -- Unix Timestamp
  pv REAL,              -- Process Value (Temp)
  sp REAL,              -- Setpoint
  mv REAL               -- Manipulated Value (Output %)
);
CREATE INDEX idx_trend_ts ON trend(ts);
```

- **Retention**: ~1 hour (Older rows are pruned automatically by `run_sensor.py`).
- **Sampling**: Configured in `config.py` (Default: every 2 seconds).

---

## Service Responsibilities

### 1. Gateway API (`gateway-api.service`)
- **Web Server**: Flask app running on `0.0.0.0:5000`.
- **Endpoints**:
    - `GET /api/state`: Returns cached state for Dashboard.
    - `POST /api/command`: Updates `setpoint`, `mode`, or `light` in the `state` table.
    - `GET /api/trend`: Queries the `trend` table for charts.
- **Direct Control**: Toggles the local Light LED (GPIO) directly via `wiringpi`.

### 2. Sensor Loop (`gateway-sensor.service`)
- **Hardware**: Accesses MAX31865 via SPI (Bus 3).
- **Loop**:
    1. Reads temperature.
    2. Writes `rtd_temp` to `state` table.
    3. Appends new row to `trend` table.
    4. Prunes `trend` table if > 1 hour of data.

### 3. Modbus Server (`gateway-modbus.service`)
- **Protocol**: Modbus TCP (Port 1502).
- **Role**: Slave/Server (The physical PLC is the Client/Master).
- **Logic**:
    - **Inputs (To PLC)**: Reads `setpoint`, `mode`, `pid_*` from DB -> Writes to Input Registers.
    - **Outputs (From PLC)**: Reads Holding Registers -> Writes `mv`, `plc_status` to DB.
    - **Handshakes**: Uses toggle-bit flags to ensure atomic updates for Setpoint/PID changes.

### 4. Relay Service (`gateway-relay.service`)
- **Target**: ESP32 at `http://192.168.8.191`.
- **Logic**:
    - Polls ESP32 status (`/status`).
    - Syncs `power_on` state from DB to ESP32.
    - Updates `esp32_connected` flag in DB.

---

## Configuration

Settings are centralized in `config.py`:
- **GPIO Pins**: `LIGHT_PIN`, `RTD_CS_PIN`.
- **Network**: `MODBUS_HOST`, `MODBUS_PORT`, `FLASK_PORT`.
- **Logging**: `logs/` directory (Rotating file logs).
