# Modbus Register Map
**Target Device**: Orange Pi Gateway (Modbus TCP Server)
**Port**: 1502 (or 502)
**Unit ID**: 1

The Gateway acts as the **Modbus Server**. The PLC (Client) reads/writes to these registers.

## 1. Holding Registers (Read Only)
*These values are set by the Web UI/Gateway. The PLC should READ these using **Fn 03** (Read Holding Registers).*

| Reg Address | Function | Data Type | Description |
| :--- | :--- | :--- | :--- |
| **HR0 - HR1** | `thermo_temp` | Float | Thermocouple Temp (if available) |
| **HR2 - HR3** | `rtd_temp` | Float | RTD Process Temp |
| **HR4** | `mode` | Int | Control Mode (0=Manual, 1=Auto, 2=Tune) |
| **HR5** | `plc_status` | Int | PLC Enabled Flag (1=Enabled) |
| **HR6** | `web_status` | Int | Web Enabled Flag (1=Enabled) |

*(Note: Data stored as big-endian float, usually spanning 2 registers)*

## 2. Holding Registers (Read/Write)
*These are used for control signals, handshakes, and PLC feedback.*

### System Control (Gateway → PLC)
*PLC should read these to know the system state.*

| Reg Address | Name | Direction | Description |
| :--- | :--- | :--- | :--- |

| **HR20** | `sensor_select`| Gateway → PLC | 0 = Thermocouple, 1 = RTD |

### Process Control Handshakes
*Gateway writes '1' to the Flag to signal new data. PLC processes it, then resets Flag to '0' to Acknowledge.*

| Data Regs | Flag (Ack) | Parameter | Description |
| :--- | :--- | :--- | :--- |
| **HR7-8** | **HR9** | `mv_manual` | Manual Output % (0-100) |
| **HR22-23**| - | `mv_auto` | **PLC → Gateway** (PLC writes Calculated MV here in Auto) |
| **HR11-16**| **HR10** | `PID` | PB (11-12), Ti (13-14), Td (15-16) |
| **HR18-19**| **HR17** | `setpoint` | Target Setpoint (°C) |

### Auto-Tune Handshake
| Register | Name | Logic |
| :--- | :--- | :--- |
| **HR24** | `tune_sp_flag` | Set to 1 by Gateway when new Tune SP is sent (in HR18-19). |
| **HR25** | `tune_start` | Set to 1 by Gateway to **START** tuning. PLC clears to 0 when started. |
| **HR26** | `tune_stop` | Set to 1 by Gateway to **STOP** tuning. PLC clears to 0 when stopped. |
| **HR27** | `tune_done` | Set to 1 by **PLC** when tuning is COMPLETE. Gateway resets to 0. |
| **HR28** | - | Reserved (was web_ack, moved to HR21) |
| **HR21** | `web_ack`   | Set to matching value of `web_status` (HR6) by **PLC** to acknowledge receipt. |

## Data Types
-   **Float**: 32-bit floating point (IEEE 754), Big-Endian. Occupies 2 Registers.
    -   Example: `sp` at HR18 = High Word, HR19 = Low Word.
-   **Int**: 16-bit Integer. Occupies 1 Register.
