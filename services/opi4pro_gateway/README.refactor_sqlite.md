# PLC Remote Lab Gateway (OPi4 Pro) — Microservices Refactor Plan (SQLite)

## Goal

Refactor the current monitored `main.py` gateway into **independent systemd services**, and replace `shared_data.py` with a **SQLite database** (`gateway.db`) shared by all services.

Benefits:
- Each component can restart independently (sensor, API, relay, modbus).
- Shared state works across systemd services.
- Trend data can be stored for ~1 hour (charts), and survives reboots if stored outside the repo.

---

## Architecture Overview

### Central Store: SQLite database
All services connect to one DB file.

**Recommended DB path:**
- `/var/lib/opi4pro_gateway/gateway.db`

Create once:
```bash
sudo mkdir -p /var/lib/opi4pro_gateway
sudo chown orangepi:orangepi /var/lib/opi4pro_gateway
```

### SQLite Concurrency & Stability Settings (MANDATORY)

Each service configure SQLite on startup:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
```

- **WAL** improves concurrency for frequent reads/writes.
- `busy_timeout` reduces transient lock failures.
- Code must still implement **retry/backoff** for rare lock collisions.

### Trend retention
Keep approximately **1 hour** of trend data. Prune old rows periodically.

---

## SQL Schema (Recommended)

### 1) `state` table (Option A — key/value latest values)
Store `value` as a **JSON string** so bool/int/float/object are consistent.

```sql
CREATE TABLE IF NOT EXISTS state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

Common keys:
- `rtd_temp` (PV)
- `setpoint` (SP)
- `mv`
- `pid_kp`, `pid_ki`, `pid_kd`
- `power_on_requested`, `power_on_actual`
- `esp32_connected`, `plc_connected`
- `sensor_last_ts`, `relay_last_ts`, `modbus_last_ok_ts`

### 2) `trend` table (time series for charts)
```sql
CREATE TABLE IF NOT EXISTS trend (
  ts INTEGER NOT NULL,
  pv REAL,
  sp REAL,
  mv REAL
);

CREATE INDEX IF NOT EXISTS idx_trend_ts ON trend(ts);
```

**Prune policy** (keep 1 hour):
```sql
DELETE FROM trend WHERE ts < (strftime('%s','now') - 3600);
```

---

## Shared DB Module

### `database.py`
Create a reusable wrapper that all services import.

Key requirements:
- Use Python stdlib `sqlite3` only.
- One connection per process is fine (no pooling required).
- Apply WAL + synchronous + busy_timeout at startup.
- Implement retry/backoff on writes for `database is locked`.
- JSON encode/decode for `state.value`.
- Create schema automatically if missing.

Functions (or methods) to implement:
- `init_schema()`
- `get_state(key, default=None)`  → returns Python value (json-decoded)
- `set_state(key, value)`         → stores json.dumps(value)
- `log_trend(pv, sp, mv, ts=None)`
- `get_recent_trend(limit=900)`   → return rows for chart
- `prune_trend(keep_seconds=3600)`

Recommended extra:
- `set_many_state(dict)` to update multiple keys in one transaction.

Environment / config:
- Support `DB_PATH` (default to `/var/lib/opi4pro_gateway/gateway.db`).

---

## Microservices (Entry Points)

Create 4 entrypoint scripts that systemd runs. These must be long-running loops or servers, and must not exit on transient errors.

### 1) `run_api.py` — Flask Web API
Responsibilities:
- Read current values from `state`
- Write commands/tuning to `state`
- Serve trend data from `trend`

Minimum endpoints:
- `GET /api/state` → returns selected `state` keys
- `POST /api/command` → updates setpoint/pid/mode/power request (writes to `state`)
- `GET /api/trend?limit=900` → reads recent rows from `trend`
- `GET /health` → returns staleness checks based on `*_last_ts` keys

Notes:
- `/health` should compute “age” in seconds:
  - `now - sensor_last_ts`, etc.
- API must remain responsive even if modbus/sensor are down.

### 2) `run_sensor.py` — MAX31865 SPI sensor loop
Responsibilities:
- Read temperature PV from MAX31865 via SPI
- Update:
  - `state['rtd_temp'] = PV`
  - `state['sensor_last_ts'] = now`
  - optionally `state['sensor_ok']`
- Every 2 seconds:
  - read `setpoint` and `mv` from DB (if available)
  - insert one row into `trend(ts,pv,sp,mv)`
- Every ~60 seconds:
  - prune old trend rows (keep 3600 seconds)

Resilience:
- If sensor read fails, log error and keep retrying.

### 3) `run_relay.py` — ESP32 relay loop
Responsibilities:
- Read desired power state:
  - `power_on_requested`
- Call ESP32 to switch/poll power relay
- Update:
  - `power_on_actual`
  - `esp32_connected`
  - `relay_last_ts`

Resilience:
- If ESP32 offline, keep retrying with backoff (do not exit).

### 4) `run_modbus.py` — PLC bridge / Modbus service
Responsibilities:
- Sync DB values ↔ PLC registers (Omron NJ301)
- Read commands from DB (`setpoint`, PID params, mode, power enable, etc.) and write to PLC
- Read PLC feedback and write back to DB
- Update:
  - `plc_connected`
  - `modbus_last_ok_ts` when comm succeeds

Resilience:
- If PLC unreachable, keep retrying forever with backoff.
- Must not freeze other services.

---

## Refactor Existing Modules (Repo Integration)

Update existing code to use DB instead of Manager:

- `shared_data.py` → remove usage; replace with `database.py`
- `web_api.py` → use GatewayDB (`get_state`, `set_state`, trend queries)
- `temp_reading.py` → write PV + trend via DB
- `relay_service.py` → read/write state via DB
- `modbus_server.py` → sync state via DB

`main.py` is no longer the production entrypoint.
- keep only as a dev helper (optional), or remove after stable.

---

## Systemd Unit Files (4 services)

Create unit files:
- `gateway-api.service`
- `gateway-sensor.service`
- `gateway-relay.service`
- `gateway-modbus.service`

Common requirements:
- `Restart=always`
- `RestartSec=2`
- `WorkingDirectory=/home/orangepi/PLC-Remote-Control-Web/services/opi4pro_gateway`
- `ExecStart=/usr/bin/python3 -u run_*.py`
- log to journald

Recommended environment line in each unit:
- `Environment=DB_PATH=/var/lib/opi4pro_gateway/gateway.db`

---

## Implementation Phases

### Phase 1 — Database Layer
1) Create `database.py` with WAL + timeout + retries + schema init.
2) Add a small self-test (optional) to confirm:
   - set/get works
   - trend insert works
   - prune works

### Phase 2 — Entry Points
1) Create `run_api.py`, `run_sensor.py`, `run_relay.py`, `run_modbus.py`.
2) Move logic from `main.py` into the correct service modules.

### Phase 3 — Replace shared_data usage
1) Replace `shared_data.py` reads/writes with DB calls across modules.
2) Confirm all services are using the same `DB_PATH`.

### Phase 4 — Deploy systemd
1) Copy unit files to `/etc/systemd/system/`
2) `sudo systemctl daemon-reload`
3) enable + start:

```bash
sudo systemctl enable gateway-api gateway-sensor gateway-relay gateway-modbus
sudo systemctl start  gateway-api gateway-sensor gateway-relay gateway-modbus
```

---

## Verification Plan

### DB sanity
```bash
sqlite3 /var/lib/opi4pro_gateway/gateway.db ".tables"
sqlite3 /var/lib/opi4pro_gateway/gateway.db "select key,value,updated_at from state limit 20;"
sqlite3 /var/lib/opi4pro_gateway/gateway.db "select count(*) from trend;"
```

### Manual runs (before systemd)
- `python3 run_sensor.py` → verify `state` + `trend` rows appear
- `python3 run_api.py` → verify `/api/state` returns DB values
- `python3 run_relay.py` → verify relay/esp32 status updates DB
- `python3 run_modbus.py` → verify retry behavior if PLC offline

### systemd health
```bash
systemctl status gateway-api gateway-sensor gateway-relay gateway-modbus --no-pager
journalctl -u gateway-sensor -n 100 --no-pager
```

Failure tests:
- PLC down: only modbus shows retry logs; API still works
- Sensor unplugged: only sensor shows errors; API shows stale timestamp via `/health`
