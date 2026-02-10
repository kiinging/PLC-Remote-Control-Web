# Modbus Register Map
**Device**: PLC (Modbus TCP Server)
**Port**: 1502
**Unit ID**: 1

The Gateway acts as the **Client** (Master). The PLC acts as the **Server** (Slave).
The Gateway connects to the PLC to Read/Write registers.

## Concept: Sequence Handshake
Instead of individual acknowledgement flags for every command, we use a global sequence number strategy to synchronize state.

1. **GW -> PLC Block**: The Gateway writes this entire block to the PLC when changes occur.
   - If `gw_tx_seq` (HR0) is different from the PLC's internal `last_seen_seq`, the PLC accepts **ALL** command values (Mode, Setpoint, MV, PID, etc.) and updates its internal state.
   - The Gateway increments `gw_tx_seq` whenever *any* command variable changes.

2. **PLC -> GW Block**: The Gateway reads this block from the PLC every cycle.
   - The PLC updates `plc_rx_seq` (HR100) to match `gw_tx_seq` after it has successfully processed the new commands.
   - The Gateway confirms synchronization when `gw_tx_seq == plc_rx_seq`.
   - **Heartbeat**: The PLC increments `plc_heartbeat` (HR101) every second. The Gateway monitors this to detect if the PLC is online.

## Register Map

### Block 1: Gateway to PLC (Written by Gateway)
| Address | Variable | Type | Description |
| :--- | :--- | :--- | :--- |
| **HR0** | `gw_tx_seq` | UINT16 | **Sequence Number**. Increments on any command change. |
| **HR1-2** | `rtd_temp` | FLOAT | Process Temperature (°C). |
| **HR3** | `web_status` | UINT16 | **Web Control**: 1=Start/On, 0=Stop/Off. |
| **HR4** | `mode` | UINT16 | **Control Mode**: 0=Manual, 1=Auto, 2=Tune. |
| **HR5** | `plc_status` | UINT16 | **Auto Control**: 1=Enabled/Start, 0=Disabled/Stop. |
| **HR6-7** | `mv_manual` | FLOAT | **Manual MV**: 0.0 - 100.0%. |
| **HR8-9** | `setpoint` | FLOAT | **Target Setpoint** (Used for Auto & Tune). |
| **HR10** | `tune_cmd` | UINT16 | **Tune Command**: 1=Start Root, 0=Stop. |
| **HR11-12** | `pid_pb` | FLOAT | **Proportional Band**. |
| **HR13-14** | `pid_ti` | FLOAT | **Integral Time**. |
| **HR15-16** | `pid_td` | FLOAT | **Derivative Time**. |
| **HR17-19** | *Reserved* | - | Reserved for future expansion. |

### Block 2: PLC to Gateway (Read by Gateway)
| Address | Variable | Type | Description |
| :--- | :--- | :--- | :--- |
| **HR100** | `plc_rx_seq` | UINT16 | **Ack Sequence**. PLC copies `gw_tx_seq` here after processing. |
| **HR101** | `plc_heartbeat` | UINT16 | **Heartbeat**. Increments every second (0-65535). |
| **HR102-103** | `mv_feedback` | FLOAT | **Active MV**. Actual output % form PLC. |
| **HR104** | `tune_done` | UINT16 | **Tune Flag**. 1=Done (Gateway reads PID params then resets `tune_cmd`). |
| **HR105-106** | `pid_pb_out` | FLOAT | **Tuned PB** (Valid when `tune_done`=1). |
| **HR107-108** | `pid_ti_out` | FLOAT | **Tuned TI** (Valid when `tune_done`=1). |
| **HR109-110** | `pid_td_out` | FLOAT | **Tuned TD** (Valid when `tune_done`=1). |
