# Omron NJ301 PLC Design Document — Part 3: NA5 HMI Integration

## 0) Architecture Summary

```
Web App (remote)                     NA5 HMI (local panel)
     │  REST API                           │  Sysmac variable mapping
     ▼                                     ▼
Gateway (OrangePi)              HMI_* global variables
     │  Modbus TCP CLIENT                  │
     ▼                                     │
  CommTask (PLC)                           │
  G_* globals <─────────── PrimaryTask arbitration ──────────► G_Eff_* globals
                              G_WebActive TRUE  → use G_*              │
                              G_WebActive FALSE → use HMI_*            ▼
                                                                  ControlTask
                                                                  PIDAT, MV, PWM
```

**Key rule:** NA5 writes only `HMI_*` globals. PLC selects via `G_WebActive`. No race.

---

## 1) Keep Your Current 3-Task Design — No New Task Needed

| Task | Role |
| :--- | :--- |
| CommTask | Modbus unpack/pack only — no HMI interaction |
| PrimaryTask | Arbitration gate: `G_WebActive` → selects `G_Eff_*` from `G_*` or `HMI_*` |
| ControlTask | Reads only `G_Eff_*` — source-agnostic (doesn't know if web or HMI) |

---

## 2) Physical Wiring & IP Plan

### Recommended Cabling

- **NA Ethernet Port 1** → same switch as NJ Ethernet/IP port (runtime comms)
- **NA Ethernet Port 2** (optional) → laptop for Sysmac Studio download and debug

### IP Example

| Device | IP |
| :--- | :--- |
| NJ301 | `192.168.0.1` |
| NA5 Port 1 | `192.168.0.2` |
| Gateway (OrangePi) | `192.168.0.100` |
| Subnet mask | `255.255.255.0` |

> Modbus TCP on port 1502 coexists — NA uses a different comms stack.

---

## 3) Add NA5 to Sysmac Studio Project

1. In Sysmac Studio with your NJ project open: **Insert → HMI → NA5**
2. Select your exact NA5 model (e.g. NA5-7W001S-V1)
3. Use the **Multiview Explorer device dropdown** to switch between Controller and HMI views

---

## 4) HMI_* Global Variables (PLC Side)

Declare all of these in the NJ project as **Global Variables** (not local to any program):

```pascal
VAR_GLOBAL
    // ── NA5 writes these (operator inputs) ───────────────────────────
    HMI_Mode          : INT;    // 0=Manual, 1=Auto, 2=Tune
    HMI_PLC_Enable    : BOOL;   // Start/Stop button
    HMI_Setpoint      : REAL;   // Setpoint entry (°C)
    HMI_Manual_MV     : REAL;   // Manual MV slider/entry (%)
    HMI_TuneCmd       : BOOL;   // Momentary tune trigger

    // PID parameter entry — NOT applied until confirm button pressed
    HMI_PID_PB        : REAL;   // Proportional Band entry
    HMI_PID_Ti        : REAL;   // Integral Time entry (seconds)
    HMI_PID_Td        : REAL;   // Derivative Time entry (seconds)
    HMI_PID_Update    : BOOL;   // Apply/Confirm button (momentary BOOL)

    // ── PLC writes these (NA5 reads for display) ──────────────────────
    HMI_PID_Update_Feedback : BOOL;  // TRUE briefly after params applied → flash msg

    // ── Status display (NA5 reads these) ──────────────────────────────
    G_WebActive       : BOOL;   // TRUE = web owns control
    G_CommAlive       : BOOL;   // TRUE = gateway comms healthy
    G_RTD_Temp        : REAL;   // Process value display
    G_Current_MV      : REAL;   // Active MV% display
    G_OverheatLatched : BOOL;   // Trip alarm display
    G_Eff_Mode        : INT;    // Active mode display
    G_PID_PB_Out      : REAL;   // Active/post-tune PB (display + pre-fill after tune)
    G_PID_Ti_Out      : REAL;   // Active/post-tune Ti
    G_PID_Td_Out      : REAL;   // Active/post-tune Td
END_VAR
```

---

## 5) NA5 Variable Mapping (Sysmac Studio)

1. In Multiview Explorer → select **NA5 device**
2. Go to **Configurations and Setup → Variable Mapping**
3. Expand **PLC device → User Variables**
4. For each variable above: right-click → **Create Device Variable**

> All variables must be **global** — local program variables are not visible to NA5.

---

## 6) NA5 Screen Layout

### Page: "Overview" (read-only status)

| Display Object | Bound Variable | Notes |
| :--- | :--- | :--- |
| PV Temperature | `G_RTD_Temp` | Numeric display, °C |
| Current MV | `G_Current_MV` | Numeric display, % |
| Active Mode | `G_Eff_Mode` | Text map: 0→Manual, 1→Auto, 2→Tune |
| Web Active | `G_WebActive` | Indicator lamp |
| Comm Alive | `G_CommAlive` | Indicator lamp |
| Overheat Trip | `G_OverheatLatched` | Red alarm lamp |

### Page: "Local Control"

| Control Object | Bound Variable | Notes |
| :--- | :--- | :--- |
| Mode selector | `HMI_Mode` | Dropdown or 3-button group |
| Start/Stop toggle | `HMI_PLC_Enable` | Toggle BOOL |
| Setpoint entry | `HMI_Setpoint` | Numeric input |
| MV slider/entry | `HMI_Manual_MV` | Numeric input, visible only in Manual mode |
| Tune trigger | `HMI_TuneCmd` | Momentary button, visible only in Tune mode |

**Disable all local controls when web owns control:**
- Bind each input object's **Enabled** property → `NOT G_WebActive`
- Show a banner "⚠ WEB CONTROL ACTIVE" when `G_WebActive = TRUE`

### Page: "PID Tuning" (local HMI PID entry)

| Control Object | Bound Variable | Notes |
| :--- | :--- | :--- |
| PB DataEdit | `HMI_PID_PB` | Pre-fill from `G_PID_PB_Out` on page open |
| Ti DataEdit | `HMI_PID_Ti` | Pre-fill from `G_PID_Ti_Out` |
| Td DataEdit | `HMI_PID_Td` | Pre-fill from `G_PID_Td_Out` |
| **Apply/Confirm button** | `HMI_PID_Update` | Momentary BOOL — PLC latches on rising edge |
| Feedback label | `HMI_PID_Update_Feedback` | "✓ Applied" text, visible = TRUE |

> **Important:** `HMI_PID_PB/Ti/Td` are NOT applied to the running PID until the operator clicks Apply. Typing in the DataEdit field alone does nothing — this prevents accidental mid-entry changes.

---

## 7) PrimaryTask Arbitration (Summary)

```pascal
// PrimaryTask — the single point of source selection

G_WebActive := (G_Web_Status <> 0) AND G_CommAlive;

// Continuous commands: select source every scan
IF G_WebActive THEN
    G_Eff_Mode       := G_Mode;          // from Modbus HR4
    G_Eff_PLC_Enable := (G_PLC_Status <> 0);
    G_Eff_Setpoint   := G_Setpoint;
    G_Eff_Manual_MV  := G_Manual_MV;
    G_Eff_TuneCmd    := (G_Tune_Cmd <> 0);
ELSE
    G_Eff_Mode       := HMI_Mode;        // from NA5
    G_Eff_PLC_Enable := HMI_PLC_Enable;
    G_Eff_Setpoint   := HMI_Setpoint;
    G_Eff_Manual_MV  := HMI_Manual_MV;
    G_Eff_TuneCmd    := HMI_TuneCmd;
END_IF;

// PID params: LATCH pattern (asymmetric)
// Web:  latch every scan  — G_PID_* only changes when operator clicks "Send" on dashboard
// HMI:  latch on Apply button rising edge only (HMI_PID_PB/Ti/Td change as user types)
IF G_WebActive THEN
    G_Eff_PID_PB := G_PID_PB;
    G_Eff_PID_Ti := G_PID_Ti;
    G_Eff_PID_Td := G_PID_Td;
ELSIF HMI_PID_Update_Rise THEN
    G_Eff_PID_PB := HMI_PID_PB;
    G_Eff_PID_Ti := HMI_PID_Ti;
    G_Eff_PID_Td := HMI_PID_Td;
    HMI_PID_Update_Feedback := TRUE;
END_IF;
// No match → G_Eff_PID_* retains last value (latch)
```

---

## 8) AutoTune Results — HMI Workflow

After AutoTune completes (`ATDone_FB = TRUE`), ControlTask writes tuned params to `G_PID_PB_Out / Ti_Out / Td_Out`. These appear on the NA5 "PID Tuning" page automatically (since those DataEdits should pre-read `G_PID_*_Out`).

**Operator workflow:**
1. AutoTune completes → NA5 shows new PB/Ti/Td values in the DataEdit fields (from `G_PID_*_Out`)
2. Operator reviews values → clicks **Apply** → `HMI_PID_Update_Rise` → PrimaryTask latches → immediately active

This keeps the operator in control — tuned params are not auto-applied.

---

## 9) Download Sequence

1. Connect PC → NJ (USB or Ethernet) → Online
2. Connect PC → NA5 (USB or NA Ethernet Port 2 direct connection)
3. **Transfer to NJ**: download controller project
4. **Transfer to NA5**: download HMI project
5. Put NJ in RUN → test NA buttons → watch `HMI_*` change in Watch window

---

## 10) Common Pitfalls

| Check | Reason |
| :--- | :--- |
| ✅ HMI_* must be **Global** variables | Local vars are not visible to NA5 variable mapping |
| ✅ Do **Variable Mapping** on NA side | Tags do not auto-appear — you must map them |
| ✅ NA writes `HMI_*` only, never `G_*` | Prevents web/HMI fighting over same variable |
| ✅ Disable local controls when `G_WebActive` | Prevents operator confusion |
| ✅ PID Apply button is momentary BOOL | NA5 should set TRUE while pressed, FALSE on release |
| ✅ `OprSetParams.CycleTime` = 40ms | Must match ControlTask interval for correct PIDAT timing |

---

## Resources

- [How to connect NA HMI to NX/NJ PLC](https://store.omron.co.nz/knowledge-base/how-to-connect-an-na-hmi-to-an-nxnj-plc)
- [NA-series Device Connection User's Manual](https://files.omron.eu/downloads/latest/manual/en/v119_na_series_programmable_terminal_device_connection_users_manual_en.pdf)
- [Omron Sysmac KB](https://www.myomron.com/index.php?action=kb&article=1245%2F1000)
