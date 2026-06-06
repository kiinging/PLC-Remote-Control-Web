# NJ301 PLC – Structured Text (ST) Program Documentation

> **Hardware**: Omron NJ301-1200 PLC + NA5 HMI  
> **Gateway**: Orange Pi 4 Pro (Python, Modbus TCP Client)  
> **Cloud**: Cloudflare Worker → Gateway Flask API → Modbus TCP → PLC  
> **Sensor**: MAX31865 RTD (PT100) read by the Orange Pi gateway

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Modbus Register Map](#2-modbus-register-map)
3. [Program Files](#3-program-files)
   - [CommTask.st](#31-commtaskst)
   - [PrimaryTask.st](#32-primarytaskst)
   - [ControlTask.st](#33-controltaskst)
4. [Key Global Variables](#4-key-global-variables)
5. [Control Flow – Step by Step](#5-control-flow--step-by-step)
6. [Reliability Analysis](#6-reliability-analysis)
7. [Overheat Protection – Current Implementation](#7-overheat-protection--current-implementation)
8. [Overheat Protection – Recommended Upgrade to 110 °C](#8-overheat-protection--recommended-upgrade-to-110-c)
9. [Reset Mechanism Design](#9-reset-mechanism-design)
10. [Suggested ST Code Changes](#10-suggested-st-code-changes)
11. [Stack Light Logic Summary](#11-stack-light-logic-summary)

---

## 1. System Architecture Overview

```
[Browser / Web App]
        │  HTTPS
        ▼
[Cloudflare Worker]  ← proxies /api/* routes, manages session cookies
        │  HTTPS (Cloudflare Tunnel)
        ▼
[Orange Pi 4 Pro – Gateway]
  ├── service_web.py    Flask REST API  :5000
  ├── service_modbus.py Modbus TCP CLIENT (master) → PLC :1502
  ├── service_sensor.py MAX31865 RTD reader → SQLite DB
  └── gateway.db        SQLite shared state

        │  Modbus TCP (LAN 192.168.0.1:1502)
        ▼
[Omron NJ301 PLC]  ← Modbus TCP SERVER (slave)
  ├── CommTask.st       (fast scan, ~10ms)  Modbus I/O
  ├── PrimaryTask.st    (fast scan, ~10ms)  Mode / Safety Logic
  └── ControlTask.st    (~40ms)             PIDAT FB execution

        │  I/O
        ▼
[Heater / PWM output Out_3]
[Stack Lights Out_0, Out_1, Out_2]

        │  NA5 HMI (local panel)
        ▼
[Operator HMI variables: HMI_*]
```

---

## 2. Modbus Register Map

### Block 1: Gateway → PLC  (Gateway WRITEs, PLC READs — HR0…HR16)

| Register | Variable | Type | Description |
|----------|----------|------|-------------|
| HR0 | `gw_tx_seq` | UINT | Sequence counter — increments on any data change |
| HR1–2 | `rtd_temp` | REAL (2×WORD) | Process temperature from RTD sensor (°C) |
| HR3 | `web_status` | INT | Web Control active: 0=Off, 1=On |
| HR4 | `mode` | INT | 0=Manual, 1=Auto, 2=AutoTune |
| HR5 | `plc_status` | INT | PLC Enable: 0=Stop, 1=Run |
| HR6–7 | `mv_manual` | REAL (2×WORD) | Manual MV% (0–100) |
| HR8–9 | `setpoint` | REAL (2×WORD) | Temperature setpoint (°C) |
| HR10 | `tune_status` | INT | AutoTune command: 0=Stop, 1=Start |
| HR11–12 | `pid_pb` | REAL (2×WORD) | Proportional Band (%) |
| HR13–14 | `pid_ti` | REAL (2×WORD) | Integration Time (s) |
| HR15–16 | `pid_td` | REAL (2×WORD) | Derivative Time (s) |

### Block 2: PLC → Gateway  (PLC WRITEs, Gateway READs — HR100…HR120)

| Register | Variable | Type | Description |
|----------|----------|------|-------------|
| HR100 | `ack_seq` | UINT | Echo of last received `gw_tx_seq` — sync confirmation |
| HR101 | `heartbeat` | UINT | Increments each Modbus transaction |
| HR102–103 | `mv_fb` | REAL (2×WORD) | Current MV% output from PLC |
| HR104 | `tune_busy` | WORD | 1 = AutoTune running |
| HR105 | `tune_done` | WORD | 1 = AutoTune finished |
| HR106 | `tune_err` | WORD | 1 = AutoTune error |
| HR107–108 | *(reserved)* | REAL | PID PB out (written but mapped gap in gateway) |
| HR109–110 | *(reserved)* | REAL | PID Ti out |
| HR111–112 | *(reserved)* | REAL | PID Td out |
| HR113–114 | `setpoint_out` | REAL (2×WORD) | Effective setpoint confirmed by PLC |
| HR115–116 | `pb_at` | REAL (2×WORD) | AutoTune result: Proportional Band |
| HR117–118 | `ti_at` | REAL (2×WORD) | AutoTune result: Integration Time |
| HR119–120 | `td_at` | REAL (2×WORD) | AutoTune result: Derivative Time |

> **Note on HR107–112**: The PLC writes `G_PID_PB_Out`, `G_PID_Ti_Out`, `G_PID_Td_Out` but the
> current `CommTask.st` leaves the corresponding `G_Modbus_WriteBuf[7..12]` entries unassigned
> (gap). The gateway still reads these positions. This is a known minor gap — not critical, but
> the values will be zero/stale.

---

## 3. Program Files

### 3.1 `CommTask.st`

**Role**: The Modbus TCP layer. Runs on a fast scan task (~10 ms).

**What it does, step by step:**

| Step | Code Block | Function |
|------|-----------|----------|
| 1 | `MB_Server(...)` | Runs the Omron Modbus TCP Server FB every scan |
| 2 | Heartbeat | Detects new Modbus traffic via `SdRcv_Counter`; increments `Heartbeat_Ctr` |
| 3 | Read HR0–16 | Copies gateway-written registers into `G_Modbus_ReadBuf[0..16]` |
| 4 | Decode | Deserialises floats using `FUN_WordsToReal`; populates `G_Web_Status`, `G_Mode`, `G_PLC_Status`, `G_Manual_MV`, `G_Setpoint`, `G_StartAT`, `G_PID_PB/Ti/Td` |
| 5 | Sequence gate | Only accepts new commands when `New_Seq ≠ Last_Seq_Num` |
| 6 | Build write buf | Packs `G_Current_MV`, autotune status, and PID results into `G_Modbus_WriteBuf[0..20]` |
| 7 | Write HR100–120 | Copies write buffer into server registers for gateway to read |

**Key design point**: The sequence-number gate (step 5) prevents repeated processing of stale Modbus frames — a good anti-glitch measure.

---

### 3.2 `PrimaryTask.st`

**Role**: Master arbitration and safety layer. Runs on the fast scan task.

**What it does, step by step:**

| Step | Lines | Function |
|------|-------|----------|
| 0 | 15–21 | **First-scan init** — seeds `G_PID_*_Out` from the effective PID values |
| 1 | 28–34 | **CommAlive watchdog** — TON timer resets if `Heartbeat_Ctr` changed; `G_CommAlive` goes FALSE after 2 s of silence |
| 1b | 39–55 | **Edge detection** — rising edges for HMI Start/Stop Manual/Auto buttons and `HMI_PID_Update` |
| 1c | 61–65 | **Edge detection** — HMI AutoTune ON/OFF buttons |
| 2 | 70 | **Web-active flag** — `G_WebActive := (G_Web_Status ≠ 0) AND G_CommAlive` |
| 3a | 76–89 | **Effective command mux** — when `G_WebActive`, web registers drive `G_Eff_*`; otherwise, HMI variables do |
| 3b | 94–112 | **PID parameter mux** — web drives continuously; HMI only on rising edge of Apply button |
| 3c | 117–133 | **HMI mode/enable latch** — Manual Start/Stop and Auto Start/Stop buttons set `HMI_PLC_Enable` and `HMI_Mode` |
| 3d | 138–145 | **HMI AutoTune latch** — ON/OFF buttons set `HMI_StartAT` |
| 4 | 152–173 | **Overheat Safety Latch** (see Section 7) |
| 5 | 177–204 | **Output gating + PWM** — computes `MV_Limited`, drives `PWM_Out` FB, hard-overrides `Out_3 := FALSE` when tripped |
| 6 | 209–211 | **Stack light logic** — Manual=Out_0, Auto=Out_1, Tune=Out_2 |

---

### 3.3 `ControlTask.st`

**Role**: Runs the Omron `PIDAT` function block. Executes on a slower 40 ms task (appropriate for thermal processes).

**What it does, step by step:**

| Step | Lines | Function |
|------|-------|----------|
| 2 | 13 | `RunCmd := G_Eff_PLC_Enable AND (NOT G_OverheatLatched)` — PIDAT is suppressed if tripped |
| 3 | 18–20 | Reads active PID parameters from `G_Eff_PID_*` |
| 3b | 26–34 | Clamps Ti and Td to [0, 10000] s, converts REAL seconds → TIME using `SecToTime()` |
| 4 | 41–58 | **Calls PIDAT FB** — `Run`, `ManCtl`, `StartAT`, `PV`, `SP`, `ManMV`, `ProportionalBand`, `IntegrationTime`, `DerivativeTime` → `MV` output |
| 5 | 63–71 | **Final MV source** — if `RunCmd=FALSE → 0.0`; if Manual → `G_Eff_Manual_MV`; if Auto/Tune → `MV_fromPID` |
| 6 | 75–93 | **AutoTune completion** — rising edge of `G_ATDone_FB` triggers capture of tuned PB/Ti/Td and resets `G_StartAT` |
| 7 | 98–100 | Reports current PID params back to web via `G_PID_*_Out` |
| 8 | 103–109 | Converts boolean FB outputs → WORD flags for Modbus |

---

## 4. Key Global Variables

| Variable | Type | Source | Purpose |
|----------|------|--------|---------|
| `G_RTD_Temp` | REAL | CommTask (HR1–2) | Process Variable — temperature (°C) |
| `G_Web_Status` | INT | CommTask (HR3) | 1 = Web Control active |
| `G_Mode` | INT | CommTask (HR4) | 0=Manual, 1=Auto, 2=Tune |
| `G_PLC_Status` | INT | CommTask (HR5) | PLC Enable command from web |
| `G_CommAlive` | BOOL | PrimaryTask | TRUE when Modbus traffic within 2 s |
| `G_WebActive` | BOOL | PrimaryTask | Web has valid live control |
| `G_Eff_PLC_Enable` | BOOL | PrimaryTask | Arbitrated Enable (Web or HMI) |
| `G_Eff_Mode` | INT | PrimaryTask | Arbitrated Mode |
| `G_Eff_Setpoint` | REAL | PrimaryTask | Arbitrated Setpoint |
| `G_Eff_Manual_MV` | REAL | PrimaryTask | Arbitrated Manual MV% |
| `G_Eff_StartAT` | BOOL | PrimaryTask | Arbitrated AutoTune command |
| `G_Eff_PID_PB/Ti/Td` | REAL | PrimaryTask | Arbitrated PID parameters |
| `G_OverheatLatched` | BOOL | PrimaryTask | Safety trip latch |
| `G_Current_MV` | REAL | ControlTask | Current MV% (single source of truth) |
| `MV_Limited` | REAL | PrimaryTask | Clamped MV% after safety gating |
| `HMI_Mode` | INT | NA5 HMI | Local mode selection |
| `HMI_PLC_Enable` | BOOL | NA5 HMI | Local enable latch |
| `HMI_Setpoint` | REAL | NA5 HMI | Local setpoint |
| `HMI_Manual_MV` | REAL | NA5 HMI | Local manual MV% |
| `HMI_StartAT` | BOOL | NA5 HMI | Local AutoTune command |
| `Heartbeat_Ctr` | UINT | CommTask | Modbus transaction counter |
| `FirstScanDone` | BOOL | PrimaryTask | First-scan flag |
| `ResetArmed` | BOOL | PrimaryTask | Reset arm flag for overheat latch |
| `WebRise` / `WebPrev` | BOOL | PrimaryTask | Edge detection for Web Control toggle |

---

## 5. Control Flow – Step by Step

```
Every fast scan (~10ms):
─────────────────────────────────────────────────────────────────────
CommTask:
  1. MB_Server FB receives Modbus frames
  2. Heartbeat_Ctr incremented on new traffic
  3. HR0–16 → G_Modbus_ReadBuf
  4. Decode: G_RTD_Temp, G_Web_Status, G_Mode, G_PLC_Status, ...
  5. Sequence gate: only process if New_Seq ≠ Last_Seq_Num
  6. Build HR100–120 write buffer (MV_fb, AT status, PID params)

PrimaryTask:
  1. CommAlive watchdog (2s timeout → G_CommAlive=FALSE)
  2. Rising edges for HMI buttons (Start/Stop/AT ON/OFF/PID Apply)
  3. G_WebActive = G_Web_Status≠0 AND G_CommAlive
  4. Mux: Web or HMI → G_Eff_* variables
  5. HMI latches for Mode and PLC_Enable
  6. Overheat safety check → G_OverheatLatched
  7. Output gating: MV_Limited = 0 if disabled or tripped
  8. PWM_Out FB → Out_3 (heater)
  9. Stack lights update

Every 40ms:
─────────────────────────────────────────────────────────────────────
ControlTask:
  1. RunCmd = G_Eff_PLC_Enable AND NOT G_OverheatLatched
  2. Load active PID params (G_Eff_PID_*)
  3. Convert Ti/Td REAL seconds → TIME
  4. PIDAT(Run:=RunCmd, PV:=G_RTD_Temp, SP:=G_Eff_Setpoint, ...)
  5. G_Current_MV := MV from PIDAT (or 0 if disabled, or ManMV)
  6. AT completion → capture tuned params, reset tune command
  7. Report PID params back (G_PID_*_Out)
```

---

## 6. Reliability Analysis

### 6.1 ✅ Strengths

| Feature | Assessment |
|---------|-----------|
| **Sequence-number gate** | Prevents stale Modbus frames from causing double-commands. Solid design. |
| **CommAlive watchdog** | 2-second timeout. If Modbus dies, `G_WebActive` goes FALSE and control falls back to HMI. This is the correct fail-safe direction. |
| **Dual-layer output gating** | MV_Limited computed in PrimaryTask, then `Out_3 := FALSE` override in the same task if `G_OverheatLatched`. Belt-and-braces is correct for safety. |
| **PIDAT Run=FALSE → integrator freeze** | When `RunCmd=FALSE`, the Omron PIDAT FB properly holds the integrator (no wind-up during idle periods). |
| **Web → HMI fallback** | When Web goes off or comms die, HMI takes over seamlessly. |
| **Edge detection on HMI buttons** | Rising-edge detection prevents button-held states from continuously re-latching. |
| **PID latch on HMI Apply** | Prevents accidental PID parameter changes mid-run; only committed on button press. |

### 6.2 ⚠️ Issues & Recommendations

#### Issue 1 — Overheat trip threshold is 100 °C (not 110 °C)
- **Current code**: trips at `G_RTD_Temp > 100.0`
- **Desired**: trip at `> 110.0 °C`
- **Action**: Change the threshold. See Section 10.

#### Issue 2 — HR107–112 gap in CommTask write buffer
- `G_Modbus_WriteBuf[7..12]` are never assigned in `CommTask.st`
- The gateway attempts to read HR107–112 as `pb_out`, `ti_out`, `td_out`
- These will always be 0 (or garbage from a previous scan)
- **Action**: Assign `G_PID_PB_Out`, `G_PID_Ti_Out`, `G_PID_Td_Out` into `WriteBuf[7..12]` in CommTask, or accept zero feedback from the web side (see Section 10).

#### Issue 3 — `G_Eff_StartAT` decoding
- `G_StartAT := WORD_TO_INT(G_Modbus_ReadBuf[10])` — valid
- `G_Eff_StartAT := (G_StartAT <> 0)` — correct conversion to BOOL
- AutoTune reset relies on the gateway sending `tune_cmd=0` after receiving `ATDone`. The gateway has a flush mechanism for this (immediate register write with `tune_cmd=0`). This is adequate.

#### Issue 4 — RTD temperature source
- `G_RTD_Temp` comes from HR1–2 written **by the gateway** (from the MAX31865 sensor on the Orange Pi)
- This is intentional (the PLC does not have direct RTD I/O in this setup), but it creates a dependency: if sensor service crashes, `G_RTD_Temp` freezes at the last value
- **Implication**: The overheat latch uses this value. If the sensor stops updating but temperature is actually rising, the latch will not trip.
- **Recommendation**: Add a sensor-staleness check on the gateway side and set `rtd_temp` to a safe high value (e.g., 150.0) if sensor data is older than 10 seconds, so the PLC's safety latch will trip.

#### Issue 5 — Web Control reset on overheat
- Current reset logic: `ResetArmed` is set when `G_Web_Status = 0` (Web OFF), and cleared on `WebRise AND ResetArmed` (Web toggled OFF→ON)
- This means toggling Web Control OFF→ON after temperature drops resets the latch — **this is the correct and intended reset mechanism**
- However: in local (HMI) mode, `HMI_Manual_Start_Rise` or `HMI_Automatic_Start_Rise` can also reset the latch, which is also correct.

#### Issue 6 — No overheat alarm in Modbus write-back
- `G_OverheatLatched` is not currently reported back to the web via Modbus HR100–120
- The web dashboard will not know that a thermal trip has occurred unless it infers from `mv_fb = 0`
- **Recommendation**: Add `G_OverheatLatched` to the Modbus write-back buffer. See Section 10.

---

## 7. Overheat Protection – Current Implementation

```st
// PrimaryTask.st lines 152–173

// 1. Trip if too hot
IF (G_RTD_Temp > 100.0) THEN
    G_OverheatLatched := TRUE;
END_IF;

// 2. Detect Web Control rising edge
WebRise := ( (G_Web_Status <> 0) AND (NOT WebPrev) );
WebPrev := (G_Web_Status <> 0);

// 3. Arm reset when Web is off
IF (G_Web_Status = 0) THEN
    ResetArmed := TRUE;
END_IF;

// 4. Reset latch (temp must be safe AND a start command given)
IF (G_RTD_Temp < 100.0) THEN
    IF (WebRise AND ResetArmed) OR HMI_Manual_Start_Rise OR HMI_Automatic_Start_Rise THEN
        G_OverheatLatched := FALSE;
        ResetArmed := FALSE;
    END_IF;
END_IF;
```

**Effect on outputs (PrimaryTask.st lines 177–204):**

```st
// MV gating
IF (NOT G_Eff_PLC_Enable) OR G_OverheatLatched THEN
    MV_Limited := 0.0;        // ← heater output forced to zero
END_IF;

// PWM output
PWM_Enable := G_Eff_PLC_Enable AND NOT G_OverheatLatched;
PWM_Out(Enable := PWM_Enable, Ain := MV_Limited, ...);

// Absolute override (belt and braces)
IF G_OverheatLatched THEN
    Out_3 := FALSE;            // ← digital output forced off
END_IF;
```

**Effect on PIDAT (ControlTask.st line 13):**

```st
RunCmd := G_Eff_PLC_Enable AND (NOT G_OverheatLatched);
// RunCmd=FALSE → PIDAT stops (MV→0, integrator freezes)
```

**Summary**: When `G_OverheatLatched = TRUE`:
- `RunCmd = FALSE` → PIDAT FB receives `Run=FALSE` → MV output from PIDAT = 0
- `MV_Limited = 0.0` → PWM duty cycle = 0%
- `PWM_Enable = FALSE` → PWM FB disabled
- `Out_3 := FALSE` → Physical heater output forced off (three layers of protection)

> **Answer to your question**: Yes, setting `RunCmd=FALSE` is the correct way to stop the PIDAT.
> When `Run=FALSE`, the Omron PIDAT FB freezes the integrator and drives MV to 0. You do **not**
> need to "turn off" the PID component separately — the `Run` pin is the proper control input.
> The current multi-layer approach (PIDAT Run, PWM_Enable, MV_Limited=0, Out_3 override) is
> robust and correct.

---

## 8. Overheat Protection – Recommended Upgrade to 110 °C

### Recommended Approach

The current architecture is sound. The only required changes are:

1. **Change the trip threshold from 100 °C to 110 °C**
2. **Change the reset hysteresis threshold** (currently also 100 °C) — recommend ~100 °C or lower to ensure a meaningful cooldown before reset is allowed
3. **Add `G_OverheatLatched` to the Modbus write-back** so the web dashboard can display a visual alarm
4. **Optionally**: add `G_OverheatLatched` to the stack light logic (e.g., blink Out_2 or set a dedicated alarm output)

### Why NOT to use a PIDAT-level approach alone

| Approach | Assessment |
|----------|-----------|
| Set `Run=FALSE` on PIDAT only | ✅ Stops PID computation. ❌ Without the PWM and Out_3 overrides, the last PWM pulse could still complete. |
| Zero `MV_Limited` only | ✅ PWM duty = 0. ❌ PIDAT integrator may wind up if still running. |
| **Current: All three layers** | ✅ Best. Run=FALSE freezes integrator; MV_Limited=0 kills PWM; Out_3=FALSE provides absolute HW override. |

**Verdict**: Keep the current three-layer approach. Only change the threshold values.

---

## 9. Reset Mechanism Design

The current reset mechanism requires:
1. Temperature to drop below the reset threshold
2. Web Control to be toggled OFF → ON (or HMI Start pressed)

This is a **deliberate manual-acknowledge requirement** — the operator must consciously re-enable the system after a thermal trip. This is the correct industrial safety pattern.

### Web Reset Flow

```
Overheat trip (T > 110°C)
        │
        ▼
G_OverheatLatched = TRUE
Heater OFF (all 3 layers)
        │
Operator sees alarm on dashboard
        │
        ▼
Operator turns Web Control OFF
        │  G_Web_Status = 0 → ResetArmed = TRUE
        ▼
Wait for temperature to cool (T < hysteresis, e.g. 95°C)
        │
        ▼
Operator turns Web Control ON again
        │  WebRise=TRUE AND ResetArmed=TRUE AND T < hyst.
        ▼
G_OverheatLatched = FALSE
System resumes
```

### HMI Reset Flow

```
Overheat trip (T > 110°C)
        │
        ▼
G_OverheatLatched = TRUE
HMI shows alarm state
        │
Operator presses Manual Start or Auto Start
        │  HMI_Manual_Start_Rise OR HMI_Automatic_Start_Rise
        │  AND G_RTD_Temp < hysteresis
        ▼
G_OverheatLatched = FALSE
System resumes
```

---

## 10. Suggested ST Code Changes

### 10.1 PrimaryTask.st – Change Overheat Threshold to 110 °C

**Change lines 152–173 to:**

```st
// ---------------------------------------------------------
// 4) Overheat Safety Latch (Trip at >110°C, reset below 95°C)
// ---------------------------------------------------------
// Constants (define in Global Variables or here as literals)
// C_OVERHEAT_TRIP  := 110.0   (°C)
// C_OVERHEAT_RESET := 95.0    (°C) — hysteresis gap prevents chatter

// 1. Trip the latch if temperature exceeds limit
IF (G_RTD_Temp > 110.0) THEN
    G_OverheatLatched := TRUE;
END_IF;

// 2. Detection of Web Control "Rising Edge" (OFF→ON toggle)
WebRise := ( (G_Web_Status <> 0) AND (NOT WebPrev) );
WebPrev := (G_Web_Status <> 0);

// 3. Arm the reset when Web Control is turned OFF
IF (G_Web_Status = 0) THEN
    ResetArmed := TRUE;
END_IF;

// 4. Latch Reset Logic
// Temperature MUST be safely below hysteresis band AND
// operator must explicitly re-issue a start command.
IF (G_RTD_Temp < 95.0) THEN
    IF (WebRise AND ResetArmed) OR HMI_Manual_Start_Rise OR HMI_Automatic_Start_Rise THEN
        G_OverheatLatched := FALSE;
        ResetArmed := FALSE;
    END_IF;
END_IF;
```

> **Why 95 °C hysteresis?** A 15 °C gap prevents the latch from chattering on and off if
> temperature hovers near 110 °C. Adjust to suit your process.

---

### 10.2 CommTask.st – Report Overheat Flag + Fix HR107–112 Gap

Add the following to the write buffer build section (step 5), replacing the empty comment block:

```st
// ===== Current PID parameters (fill the HR107–112 gap) =====
R2W_PB(InReal := G_PID_PB_Out);
G_Modbus_WriteBuf[7]  := R2W_PB.W_High;       // HR107
G_Modbus_WriteBuf[8]  := R2W_PB.W_Low;        // HR108

R2W_Ti(InReal := G_PID_Ti_Out);
G_Modbus_WriteBuf[9]  := R2W_Ti.W_High;       // HR109
G_Modbus_WriteBuf[10] := R2W_Ti.W_Low;        // HR110

R2W_Td(InReal := G_PID_Td_Out);
G_Modbus_WriteBuf[11] := R2W_Td.W_High;       // HR111
G_Modbus_WriteBuf[12] := R2W_Td.W_Low;        // HR112

// ===== Overheat Alarm Flag =====
IF G_OverheatLatched THEN
    G_Modbus_WriteBuf[21] := WORD#1;           // HR121 — overheat latched
ELSE
    G_Modbus_WriteBuf[21] := WORD#0;
END_IF;
```

Also update the copy loop at the end:

```st
// Extend from 20 to 21 to include overheat flag
FOR i := 0 TO 21 DO
    Registers[100 + i] := G_Modbus_WriteBuf[i];
END_FOR;
```

Then update the gateway `service_modbus.py` to read HR100–121 (22 registers) and handle:

```python
rr = client.read_holding_registers(100, 22, unit=1)  # HR100-HR121
...
overheat = bool(regs[21])          # HR121
db.set_state("overheat_latched", overheat)
```

And expose it in `service_web.py` `control_status` endpoint:

```python
"overheat_latched": db.get_state("overheat_latched", False),
```

---

### 10.3 Stack Light – Add Overheat Alarm Indicator

In **PrimaryTask.st**, the existing stack light section (lines 209–211):

```st
// Current:
Out_0 := (G_Mode_Manual AND G_Eff_PLC_Enable AND NOT G_OverheatLatched);
Out_1 := (G_Mode_Auto   AND G_Eff_PLC_Enable AND NOT G_OverheatLatched);
Out_2 := (ATBusy_FB     AND G_Eff_PLC_Enable AND NOT G_OverheatLatched);
```

If you have a spare output (e.g., `Out_4`), add:

```st
// Overheat alarm light (red lamp)
Out_4 := G_OverheatLatched;
```

Or to blink `Out_2` as an alarm (reusing the existing light):

```st
// AutoTune busy OR Overheat alarm (reuse Out_2)
Out_2 := (ATBusy_FB AND G_Eff_PLC_Enable AND NOT G_OverheatLatched) OR G_OverheatLatched;
```

---

### 10.4 Recommended Global Variable Additions

If you define constants in the NJ301 Global Variable Table, add:

```
C_OVERHEAT_TRIP   : REAL := 110.0;   (* Trip threshold °C *)
C_OVERHEAT_RESET  : REAL := 95.0;    (* Reset hysteresis °C *)
```

Then reference them in PrimaryTask.st for maintainability:

```st
IF (G_RTD_Temp > C_OVERHEAT_TRIP) THEN
    G_OverheatLatched := TRUE;
END_IF;
...
IF (G_RTD_Temp < C_OVERHEAT_RESET) THEN
    ...
END_IF;
```

---

## 11. Stack Light Logic Summary

| Output | Light Colour (typical) | Condition |
|--------|----------------------|-----------|
| `Out_0` | Yellow | Manual mode active AND PLC enabled AND not tripped |
| `Out_1` | Green | Auto mode active AND PLC enabled AND not tripped |
| `Out_2` | Blue/White | AutoTune running AND PLC enabled AND not tripped |
| `Out_3` | — (heater) | PWM output to heater SSR |
| `Out_4` *(recommended)* | Red | Overheat trip latched |

---

## Summary of Recommended Changes

| Priority | Change | File | Reason |
|----------|--------|------|--------|
| 🔴 High | Change trip threshold 100→110 °C | PrimaryTask.st | Your requirement |
| 🔴 High | Change reset hysteresis 100→95 °C | PrimaryTask.st | Prevent chatter |
| 🟠 Medium | Add HR121 overheat flag to Modbus write-back | CommTask.st | Dashboard alarm |
| 🟠 Medium | Fill HR107–112 gap with PID params | CommTask.st | Data integrity |
| 🟡 Low | Add `Out_4` or modify `Out_2` for alarm lamp | PrimaryTask.st | Operator awareness |
| 🟡 Low | Gateway sensor staleness → force high temp | service_sensor.py | Belt-and-braces |

---

*Last updated: 2026-06-03*  
*Author: NJ301 Lab Control System — Curtin Industrial Automated Systems 2025/2026*
