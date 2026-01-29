# System Architecture

## Overview
The **PLC Remote Control Web** is a microservices-based system running on an Orange Pi 4 Pro. It is designed to be modular, fault-tolerant, and secure.

### Core Components
1.  **Frontend**: React + Vite application (hosted on Cloudflare Pages).
2.  **Worker**: Cloudflare Worker acting as a secure proxy and auth provider.
3.  **Gateway (Orange Pi)**:
    -   **API Service**: Flask web server handling commands and status updates.
    -   **Modbus Service**: Modbus TCP Server bridging the DB and PLC.
    -   **Sensor Service**: Reads RTD temperatures via SPI.
    -   **Relay Service**: Manages ESP32 smart relay power.
4.  **Database**: Local SQLite (`gateway.db`) acting as the central state store (IPC).

---

## Inter-Process Communication (IPC)

All local services communicate by reading/writing to a shared SQLite database. This decouples the processes—if the API crashes, the Modbus loop continues running.

### Database Schema (`state` table)
| Key | Type | Description | Source |
| :--- | :--- | :--- | :--- |
| `rtd_temp` | Float | Measured process temperature | Sensor Service |
| `setpoint` | Float | Target temperature | Web API |
| `mv` | Float | Manipulated Variable (Output %) | Modbus Service (Auto) / Web API (Manual) |
| `mode` | Int | 0=Manual, 1=Auto, 2=Tune | Web API |
| `power_on` | Int | 0=Off, 1=On (Relay State) | Web API (Master) |
| `pid_pb` | Float | Proportional Band | Web API |
| `pid_ti` | Float | Integral Time | Web API |
| `pid_td` | Float | Derivative Time | Web API |

---

## Modbus Architecture
The Gateway runs a **Modbus TCP Server** on port `502` (or `1502`).
-   **Gateway Role**: Server (Slave).
-   **PLC Role**: Client (Master).
-   **Data Flow**:
    -   **Gateway → PLC**: Setpoint, Mode, PID Params, Power State (Inputs).
    -   **PLC → Gateway**: Calculated MV (Auto), Status Feedback (Outputs).


For the detailed Register Map, see [MODBUS_MAP.md](./MODBUS_MAP.md).

---

## Gateway API Endpoints
The Flask API (`gateway-api.service`) runs on Port 5000.

### Control & Status
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/control_status` | GET | Returns structure of light, plc, web, mode status. |
| `/temp` | GET | Returns current temperature and timestamps. |
| `/heartbeat` | GET | **Enhanced Health Check**. Returns system status, timestamps, and age of sensor/modbus loops. (Checks if services are stalled). |

### Action Commands
| Endpoint | Method | Payload | Description |
| :--- | :--- | :--- | :--- |
| `/relay` | POST | `{"on": true/false}` | Controls Main Power Relay (ESP32). |
| `/setpoint` | POST | `{"setpoint": 45.5}` | Updates Target Temperature. |
| `/mode/[manual/auto/tune]` | POST | - | Switches Control Mode. |
| `/tune_start` / `/tune_stop` | POST | - | Controls Auto-Tune Process. |

### Video Stream
-   **URL**: `/video_feed` (Proxied via Cloudflare Worker)
-   **Direct**: `http://<radxa-ip>:5000/video_feed`

