# Gateway Services Documentation

## Overview
The `opi4pro_gateway` is a multiprocess Python system designed to bridge the gap between physical sensors, a web interface, control logic, and a PLC. Use `main.py` to orchestrate the startup of all services.

## Architecture
The system relies on **Python Multiprocessing** to run four concurrent services that communicate via a shared memory object (`Manager.dict`).

### Shared Memory (`shared_data.py`)
- Acts as the central state store.
- **Inputs**: Sensor readings, Web commands, PLC status.
- **Outputs**: Control setpoints, Relay commands, Indicator statuses.
- **Persistence**: **None**. Data is lost on restart.

### Services

#### 1. Web API (`web_api.py`)
- **Role**: Provides the REST API for the frontend dashboard.
- **Port**: 5000 (Flask).
- **Key Functions**:
    - Serves heartbeat and status JSON.
    - Receives user commands (Start/Stop, PID params, Setpoints).
    - Controls localized GPIO (Light).
- **Reliability Note**: Directly accesses `wiringpi`. Failure in GPIO init is caught but disables light control.

#### 2. Sensor Service (`temp_reading.py`)
- **Role**: Reads temperature from MAX31865 (RTD) via SPI.
- **Interval**: 2 seconds.
- **Key Functions**:
    - Updates `rtd_temp` in shared memory.
    - Maintains an in-memory `trend` buffer (last 30 mins).
- **Reliability Note**: Trend data is in-memory only. Restarts clear the history.

#### 3. Relay Service (`relay_service.py`)
- **Role**: Manages connection to the ESP32 wireless relay.
- **Interval**: 1 second polling.
- **Key Functions**:
    - Polls ESP32 status.
    - Enforces `power_on` state (Consistency Check).
- **Reliability Note**: Relies on network stability. Has auto-retry logic but can introduce latency.

#### 4. Modbus Server (`modbus_server.py`)
- **Role**: Communicates with the Omron PLC via Modbus TCP.
- **Port**: 1502.
- **Key Functions**:
    - Maps shared memory values to Modbus Holding/Input registers.
    - Implements complex **handshake logic** for Setpoints, PID, and Manual MV updates to ensure atomic transfers to the PLC.
- **Reliability Note**: 
    - Hardcoded Register Map.
    - Complex float packing/unpacking (Big Endian).
    - Logging path is hardcoded (`/home/orangepi/...`).

## Reliability Analysis

### Strengths
- **Decoupled**: One service crashing doesn't immediately take down others (unless it's the main process or shared memory manager).
- **Async Polling**: Web UI remains responsive even if Modbus or ESP32 is slow.

### Weaknesses & Risks
1.  **Hardcoded Paths**: `modbus_server.py` logs to `/home/orangepi/projects/flask/mv_log.txt`. This will likely fail on a new system or different user.
2.  **Data Loss**: Trend data is purely in-memory.
3.  **Process Management**: `main.py` uses simple `Process.join()`. If a child process crashes silently, it might not be restarted automatically.
4.  **Modbus Fragility**: The handshake logic (set flag, wait for ack, clear flag) is robust but complex to maintain. A stuck flag could freeze updates.
5.  **GPIO dependency**: `wiringpi` setup is global. If the hardware configuraiton changes, code modification is required.

## Modbus Register Map (excerpt)
| Register | Type | Description |
| :--- | :--- | :--- |
| HR0-6 | Float | Control statuses (Web, PLC, Mode) |
| HR10-16 | Float | PID Parameters (Flag, PB, Ti, Td) |
| HR18-19 | Float | Setpoint Value |
| HR22-23 | Float | MV (from PLC) |
| HR25-26 | Int | Tuning Controls |
