# Communication Protocol & Architecture

## Overview
The PLC Remote Control system uses a tiered architecture to ensure secure and efficient control of the industrial hardware.

**Chain of Command:**
`User Browser (React)` -> `Orange Pi Gateway (Flask)` -> `ESP32 Relay Node`

## Communication Flow

### 1. Gateway <-> ESP32 (Local Network)
- **Protocol**: HTTP REST
- **Initiator**: Gateway (Orange Pi) polls the ESP32.
- **Frequency**: Every 2 seconds (via `relay_service.py`).
- **Endpoints**:
    - `POST /relay`: Controls the relay on/off.
    - `GET /status`: Retrieves current state and uptime.
- **Security**: 
    - **API Key**: `X-API-Key` header required for all requests.
    - **Network**: ESP32 only accepts commands from likely Gateway IPs (though hard enforcement is via Key).
- **Failsafe**: ESP32 auto-turns OFF relay if no command/status check is received for 15 seconds.

### 2. Web App <-> Gateway (User Network)
- **Protocol**: HTTP REST
- **Initiator**: Web App (React) polls the Gateway.
- **Frequency**: Every 1 second (via `Dashboard.jsx`).
- **Endpoints**:
    - `GET /relay_status`: Returns **cached** status from the Gateway's memory. This is instant and does not wait for the ESP32.
- **Efficiency Optimization**:
    - **Caching**: The Gateway's `relay_service.py` runs in the background updating `shared_data`. The Web API serves this data instantly to potential multiple frontend clients without overwhelming the ESP32.
    - **Optimistic Updates**: When the User clicks "ON", the UI updates immediately, and the backend marks the cache as "ON" upon successful dispatch, preventing UI flicker.
    - **Stale Data Detection**: If the Gateway hasn't successfully talked to the ESP32 in >15 seconds, it reports `alive: false` to the frontend, even if the last known state was valid.

## Data Structures

### Relay Status Object (Frontend)
```json
{
  "alive": true,      // true if Gateway communicated with ESP32 recently (<15s)
  "relay": false,     // true=ON, false=OFF, null=Unknown
  "last_seen_s": 2.5, // Seconds since last successful ESP32 poll
  "desired": false    // The state the Gateway *wants* the ESP32 to be in
}
```

## Security Summary
- **Physical Isolation**: ESP32 is on the local industrial network.
- **Authentication**: Simple API Key for local node references.
- **Authorization**: Web App checks User/Admin roles before allowing POST commands to the Gateway.
