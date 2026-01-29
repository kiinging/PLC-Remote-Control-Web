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
