# System Architecture

## Overview
The **PLC Remote Control Web** is a microservices-based system running on an Orange Pi 4 Pro. It is designed to be modular, fault-tolerant, and secure, bridging a React Frontend with an Omron NX1P2 PLC.

### Core Components
1.  **Frontend**: React + Vite application (hosted on Cloudflare Pages).
2.  **Worker**: Cloudflare Worker acting as a secure proxy and auth provider.
3.  **Gateway (Orange Pi)**:
    -   **API Service**: Flask web server handling commands and status updates.
    -   **Modbus Service**: Modbus TCP Server bridging the DB and PLC.
    -   **Sensor Service**: Reads RTD temperatures via SPI.
    -   **Relay Service**: Manages ESP32 smart relay power (Main Heater Power).
    -   **Light Control**: Direct GPIO control of the stack light/indicator.
4.  **Database**: Local SQLite (`gateway.db`) acting as the central state store (IPC).

---

## Gateway Hardware & Light Control
The Gateway (Orange Pi 4 Pro) directly manages physical hardware in addition to the PLC connection.

### Light Control
-   **Hardware**: LED/Stack light connected to **GPIO Pin 18 (PL2)** (WiringPi Pin 10).
-   **Mechanism**: Direct GPIO manipulation via the Flask API.
-   **Control Flow**: 
    1.  User clicks "Light On" in Dashboard.
    2.  request `POST /light/on` -> Flask API.
    3.  API writes `1` to GPIO Pin.
    4.  API updates `gateway.db` key `light = 1`.

---

## Communication Architecture (Frontend ↔ Gateway)

The system uses a **REST API Polling** architecture. The Frontend (`Dashboard.jsx`) runs a `setInterval` loop every **1000ms** (1 second) to fetch data.

### Dashboard Polling & Data Return
The dashboard aggregates system state by polling the following endpoints.

#### 1. System Control & Status (`GET /control_status`)
Returns the master state object for UI rendering.
*   **Response Payload**:
    ```json
    {
      "light": 0,           // Light Status (0/1)
      "plc": 1,             // PLC Enable Status (0/1)
      "mode": 1,            // 0=Manual, 1=Auto, 2=Tune
      "mv": 45.5,           // Manipulated Variable (Actual Output % from PLC)
      "web_ack": true,      // Handshake: Has PLC acknowledged the Web Start command?
      "mv_ack": true,       // Handshake: Has PLC acknowledged Manual MV?
      "plc_ack": true,      // Handshake: Has PLC acknowledged PLC Start?
      "plc_alive": true,    // Heartbeat: Is PLC actively updating?
      "plc_last_seen": 1700001234.5,
      "web": 1,             // Current Web Control command state
      "web_desired": 1      // Target Web Control state
    }
    ```

#### 2. Temperature Data (`GET /temp`)
Returns real-time process values.
*   **Response Payload**:
    ```json
    {
      "rtd_temp": 123.4,    // Measured Temperature (PT100)
      "last_update": 1700001234.0 // Timestamp of last sensor read
    }
    ```

#### 3. Heartbeat (`GET /heartbeat`)
Enhanced health check to detect stalled services.
*   **Response Payload**:
    ```json
    {
      "status": "alive",
      "sensor_ok": true,    // Is Sensor Service running?
      "modbus_ok": true,    // Is Modbus Service running?
      "sensor_age_sec": 0.5,
      "modbus_age_sec": 0.2
    }
    ```

#### 4. Relay Status (`GET /relay_status`)
*   **Response Payload**:
    ```json
    {
      "alive": true,        // Is ESP32 Online?
      "relay": 1,           // Actual Relay State
      "desired": 1          // Desired State
    }
    ```

### Action Commands
| Endpoint | Method | Payload | Description |
| :--- | :--- | :--- | :--- |
| `/light/on` / `/light/off` | POST | - | Controls Local GPIO Light. |
| `/plc/on` / `/plc/off` | POST | - | Enables/Disables PLC Control Logic. |
| `/mode/[manual/auto/tune]` | POST | - | Switches Control Mode. |
| `/setpoint` | POST | `{"setpoint": 45.5}` | Updates Target Temperature. |
| `/mv_manual` | POST | `{"mv_manual": 50.0}` | Sets Output % (Manual Mode only). |
| `/tune_start` / `/tune_stop` | POST | - | Controls Auto-Tune. |
| `/relay` | POST | `{"on": true}` | Controls ESP32 Relay. |

---

## Inter-Process Communication (IPC)
All local services communicate by reading/writing to a shared SQLite database (`gateway.db`). This decouples the processes—if the API crashes, the Modbus loop continues running.

### Database Schema & Modbus Relation
Most database keys correspond directly to Modbus Holding Registers (HR) for synchronization with the PLC.

| DB Key | Type | Description | Source | Modbus Register (HR) |
| :--- | :--- | :--- | :--- | :--- |
| **`rtd_temp`** | Float | Measured process temperature | Sensor Service | `HR1-2` |
| **`setpoint`** | Float | Target temperature | Web API | `HR8-9` |
| **`mv_manual`** | Float | Manual Output % Command | Web API | `HR6-7` |
| **`mode`** | Int | 0=Manual, 1=Auto, 2=Tune | Web API | `HR4` |
| **`plc_status`** | Int | PLC Logic Enable | Web API | `HR5` |
| **`web`** | Int | Web Controller Active | Web API | `HR3` |
| **`pid_pb`** | Float | Proportional Band | Web API / PLC (Tune) | `HR11-12` |
| **`pid_ti`** | Float | Integral Time | Web API / PLC (Tune) | `HR13-14` |
| **`pid_td`** | Float | Derivative Time | Web API / PLC (Tune) | `HR15-16` |
| **`tune_status`** | Int | Tuning Command (1=Start) | Web API | `HR10` |
| **`mv`** | Float | **Actual Output % Feedback** | PLC (Modbus) | `HR102-103` |
| **`tune_done`** | Bool | Tuning Complete Flag | PLC (Modbus) | `HR104` (Derived) |
| **`modbus_plc_synced`** | Bool | Handshake Sync Status | Modbus Service | N/A (Internal Logic) |
| **`light`** | Int | Local Light Status | Web API | **N/A (GPIO)** |
| **`relay_actual`** | Int | ESP32 Relay Status | Relay Service | **N/A (Wi-Fi)** |

---

## Modbus Architecture
The Gateway runs a **Modbus TCP Server** on port `502` (or `1502`).
-   **Gateway Role**: Server (Slave).
-   **PLC Role**: Client (Master).

### Handshake & Robustness
To ensure commands are received by the PLC:
1.  **Sequence Number**: The Gateway increments a sequence number (HR0) whenever a command changes (Setpoint, Mode, etc.).
2.  **Acknowledgement**: The PLC echoes this sequence number back to the Gateway (HR100).
3.  **Sync Status**: The Webservice reports `_ack` fields by checking if `HR0 == HR100`.

### Data Flow
-   **Gateway → PLC** (HR0 - HR99): Commands, Setpoints, Sensor Data.
-   **PLC → Gateway** (HR100 - HR199): Feedback, MV, Auto-Tune Results, Heartbeat.
