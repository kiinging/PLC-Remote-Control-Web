# System Handshake Protocols

This document describes the handshake mechanisms used between the **Gateway (OrangePi)** and the **PLC** to ensure reliable control over the stateless Modbus TCP connection.

## Why Handshakes?
Modbus TCP is "fire and forget". When the Gateway writes a value to a register, it has no built-in way to know if the PLC logic has actually processed that value or if the PLC is even running its main loop.

We use **Application-Level Handshakes** to ensure the PLC has received and acted upon specific commands.

---

## 1. Web Control Handshake (Continuous Mirror)
*Used for: Main System Enable/Disable (Web Control)*

This simplest form of handshake requires the PLC to continuously "mirror" the status signal.

*   **Trigger**: Gateway writes `1` (or `0`) to `web_status` (HR6).
*   **PLC Logic**: PLC reads HR6. If HR6 is 1, it writes 1 to `web_ack` (HR28). If HR6 is 0, it writes 0 to `web_ack`.
*   **Acknowledgement**: Gateway polls HR28.
    *   If `HR28 == HR6`, the command is considered **Acknowledged**.
    *   The Web UI shows a spinner until this condition is met.

| Source | Register | Function |
| :--- | :--- | :--- |
| **Gateway** | **HR6** | `web_status` (Command) |
| **PLC** | **HR28** | `web_ack` (Feedback) |

---

## 2. Setpoint / Parameter Handshake (Flag-Based)
*Used for: Setpoint, PID Parameters, Tune Setpoint*

This method is used when sending specific values (floats) that only change occasionally. We use a separate "Flag" register to signal a new update.

1.  **Gateway**:
    *   Writes new value to Data Register (e.g., Setpoint to HR18-19).
    *   Writes `1` to the **Flag Register** (e.g., HR17).
2.  **PLC**:
    *   Detects Flag Register == `1`.
    *   Copies Data Register to internal variable.
    *   Writes `0` to the **Flag Register** (Ack).
3.  **Gateway**:
    *   Polls Flag Register.
    *   When it returns to `0`, the UI notification (spinner or "Pending") is cleared.

| Feature | Data Regs | Flag Reg (Gateway Sets 1, PLC Clears 0) |
| :--- | :--- | :--- |
| **Setpoint** | HR18-19 | **HR17** |
| **PID** | HR11-16 | **HR10** |
| **Manual MV** | HR7-8 | **HR9** |
| **Tune SP** | HR18-19 | **HR24** |

---

## 3. Command Trigger Handshake (Pulse)
*Used for: Start Tune, Stop Tune*

Used for momentary actions that don't carry data.

1.  **Gateway**: Writes `1` to the Command Register.
2.  **PLC**:
    *   Detects `1`.
    *   Executes the action (e.g., Starts Auto-Tune State Machine).
    *   Writes `0` back to the Command Register.
3.  **Gateway**: Sees `0` and knows the command was accepted.

| Command | Register |
| :--- | :--- |
| **Start Tune** | HR25 |
| **Stop Tune** | HR26 |

---

## 4. Completion Handshake (Reverse Pulse)
*Used for: Tune Done*

Used when the PLC needs to tell the Gateway something finished.

1.  **PLC**: Writes `1` to Status Register (HR27 `tune_done`) when tuning is finished.
2.  **Gateway**:
    *   Polls HR27.
    *   Sees `1`.
    *   Reads the new PID results.
    *   Writes `0` to HR27 to reset/acknowledge reading the results.

| Event | Register |
| :--- | :--- |
| **Tune Done** | HR27 |
