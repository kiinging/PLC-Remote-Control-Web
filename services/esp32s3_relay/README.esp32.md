# ESP32-S3 LAN-Based Relay Control

## Architecture Overview
The system moves from a **Polling Architecture** (ESP32 asks Cloud "Should I turn on?") to a **Push Architecture** (Orange Pi tells ESP32 "Turn on!").

### Data Flow
1.  **User Dashboard**: User clicks "Relay ON".
2.  **Request**: `POST /relay` sent to Cloudflare Worker.
3.  **Proxy**: Worker proxies request to Orange Pi Gateway (`https://orangepi.plc-web.online/relay`).
4.  **Local Control**: Orange Pi receives request, validates it, and makes a local LAN HTTP request to the ESP32 (`http://ESP32_IP/relay`).
5.  **Action**: ESP32 validates API Key, turns GPIO 18 LOW (Active Low), and returns success.

## Safety Features (Failsafe)
The ESP32 firmware includes a **Dead Man's Switch**:
- **Why?** If the Orange Pi crashes, WiFi fails, or the network cable is cut, we don't want the relay (e.g., heater/motor) to stay ON forever.
- **How?** The ESP32 expects a valid command at least every **15 seconds**.
- **Result**: If 15 seconds pass without a command, the ESP32 automatically turns the Relay **OFF**.

## Security
- **X-API-Key**: The communication between Orange Pi and ESP32 is protected by a predefined API Key header.

## setup
1.  **WiFi credentials** are hardcoded in `main.cpp` (or use WiFiManager if extended).
2.  **IP Address**: DHCP is used, but setting a Static Lease in your router for the ESP32 is recommended so the Orange Pi always knows where it is.
