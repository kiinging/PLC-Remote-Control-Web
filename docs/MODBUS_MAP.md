# Modbus Register Map
**Device**: Orange Pi Gateway (Modbus TCP Server)
**Port**: 1502
**Unit ID**: 1

The Gateway acts as the **Server**. The PLC (Client) reads/writes these registers using **Function 03** (Read Holding Registers) and **Function 16** (Write Multiple Registers).

## Compacted Register Map (Refactored Keys)

| Reg Address | Variable / Function | Data Type | Direction | Handshake Flag | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **HR0-1** | `rtd_temp` | Float | GW → PLC | - | RTD Process Temperature (°C). |
| **HR2** | `mode_ack` | Int | PLC → GW | - | **Mode Ack**. PLC copies HR3 here. |
| **HR3** | `mode` | Int | GW → PLC | HR2 | **Control Mode**: 0=Manual, 1=Auto, 2=Tune. |
| **HR4** | `web_ack` | Int | PLC → GW | - | **Web Control Ack**. PLC copies HR5 here. |
| **HR5** | `web_status` | Int | GW → PLC | HR4 | **Web Control Start/Stop**. 1=Start, 0=Stop. |
| **HR6** | `plc_ack` | Int | PLC → GW | - | **PLC Control Ack**. PLC copies HR7 here. |
| **HR7** | `plc_status` | Int | GW → PLC | HR6 | **Auto Control Start/Stop**. 1=Start/Enabled, 0=Stop. |
| **HR8** | `mv_req` | Int | GW → PLC | **HR8** | **Handshake Flag** for Manual MV. |
| **HR9-10** | `mv_manual` | Float | GW → PLC | HR8 | Manual Manipulated Value (0-100%). |
| **HR11** | `pid_req` | Int | GW → PLC | **HR11** | **Handshake Flag** for PID Params. |
| **HR12-13** | `pid_pb` | Float | GW ↔ PLC | HR11/Done | Proportional Band. (Read on Done). |
| **HR14-15** | `pid_ti` | Float | GW ↔ PLC | HR11/Done | Integral Time. (Read on Done). |
| **HR16-17** | `pid_td` | Float | GW ↔ PLC | HR11/Done | Derivative Time. (Read on Done). |
| **HR18** | `sp_req` | Int | GW → PLC | **HR18** | **Handshake Flag** for Setpoint (Used for both Auto & Tune). |
| **HR19-20** | `setpoint` | Float | GW → PLC | HR18 | Target Setpoint. |
| **HR21-22** | `mv_feedback` | Float | PLC → GW | - | **Real MV Return**. PLC writes actual output %. |
| **HR23** | `tune_status_ack` | Int | PLC → GW | - | **Tune Status Ack**. PLC copies HR24 here. |
| **HR24** | `tune_status` | Int | GW → PLC | HR23 | **Tune Command**. 1=Start Tuning, 0=Stop Tuning. |
| **HR25** | `tune_done` | Int | PLC → GW | - | **Tune Done Flag**. Set 1 by PLC when complete. |
| **HR26-27** | *Reserved* | - | - | - | Reserved for future use. |

**Total Size:** 26 Registers (0 to 25).
