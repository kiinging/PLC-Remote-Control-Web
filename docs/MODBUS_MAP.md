# Modbus Register Map
**Device**: Orange Pi Gateway (Modbus TCP Server)
**Port**: 1502
**Unit ID**: 1

The Gateway acts as the **Server**. The PLC (Client) reads/writes these registers using **Function 03** (Read Holding Registers) and **Function 16** (Write Multiple Registers).

| Reg Address | Variable / Function | Data Type | Direction | Handshake Flag | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **HR0-1** | `tc_temp` | Float | GW → PLC | - | Reserved (was Thermocouple). Defaults to 0.0. |
| **HR2-3** | `rtd_temp` | Float | GW → PLC | - | RTD Process Temperature (°C). |
| **HR4** | `mode` | Int | GW → PLC | - | Control Mode: 0=Manual, 1=Auto, 2=Tune. |
| **HR5** | `plc_status` | Int | GW → PLC | - | **Auto Control Start/Stop**. 1=Start/Enabled, 0=Stop. (No Ack). |
| **HR6** | `web_status` | Int | GW → PLC | **HR21** (Echo) | **Web Control Start/Stop**. 1=Start, 0=Stop. PLC echoes to HR21. |
| **HR7** | `mv_manual_flag` | Int | GW → PLC | **HR7** | **Handshake Flag** for Manual MV. Set 1 by GW, cleared to 0 by PLC. |
| **HR8-9** | `mv_manual` | Float | GW → PLC | HR7 | Manual Manipulated Value (0-100%). |
| **HR10** | `pid_flag` | Int | GW → PLC | **HR10** | **Handshake Flag** for PID Params. Set 1 by GW, cleared to 0 by PLC. |
| **HR11-12** | `pid_pb` | Float | GW → PLC | HR10 | Proportional Band. |
| **HR13-14** | `pid_ti` | Float | GW → PLC | HR10 | Integral Time. |
| **HR15-16** | `pid_td` | Float | GW → PLC | HR10 | Derivative Time. |
| **HR17** | `sp_flag` | Int | GW → PLC | **HR17** | **Handshake Flag** for Setpoint. Set 1 by GW, cleared to 0 by PLC. |
| **HR18-19** | `setpoint` | Float | GW → PLC | HR17 / HR24 | Target Setpoint (Used for both Normal SP and Tune SP). |
| **HR20** | `sensor_select` | Int | GW → PLC | - | Sensor Select: 0=TC, 1=RTD. |
| **HR21** | `web_ack` | Int | PLC → GW | - | **Web Control Ack**. PLC copies HR6 here to confirm receipt. |
| **HR22-23** | `mv` | Float | PLC → GW | - | **Real MV Return**. PLC writes the actual output % here (Auto or Manual). |
| **HR24** | `tune_sp_flag` | Int | GW → PLC | **HR24** | **Handshake Flag** for Tune Setpoint. Data in HR18-19. |
| **HR25** | `tune_start_flag` | Int | GW → PLC | **HR25** | Set 1 by GW to **Start** Tuning. PLC clears to 0. |
| **HR26** | `tune_stop_flag` | Int | GW → PLC | **HR26** | Set 1 by GW to **Stop** Tuning. PLC clears to 0. |
| **HR27** | `tune_done_flag` | Int | PLC → GW | **HR27** | Set 1 by **PLC** when Tuning completes. GW clears to 0. |
