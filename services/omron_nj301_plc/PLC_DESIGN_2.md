# Omron NJ301 PLC Design Document — Part 2: PrimaryTask & ControlTask

## Overview: Task Responsibilities

| Task | Interval | Owns |
| :--- | :--- | :--- |
| **PrimaryTask** | 4ms | Watchdog, arbitration (`G_Eff_*`), overheat latch, PWM output, stack lights |
| **ControlTask** | 40ms | PIDAT, MV selection, AutoTune feedback, PID param reporting |
| **CommTask** | 100ms | Modbus server, pack/unpack registers only |

**Design rule:** `ControlTask` reads **only** `G_Eff_*` globals. It never reads `G_*` (Modbus) or `HMI_*` (NA5) directly. All source selection/latching is done in `PrimaryTask`.

---

## A) Global Variables (add to existing in PLC_DESIGN_1.md)

```pascal
VAR_GLOBAL
    // HMI Apply button edge-detect (internal to PrimaryTask — can be local or global)
    HMI_PID_Update_Prev : BOOL;
    HMI_PID_Update_Rise : BOOL;

    // Watchdog (local to PrimaryTask — declare as VAR if preferred)
    HB_Last  : UINT;
END_VAR
```

---

## B) PrimaryTask (4ms) — Safety + Arbitration + PWM

Assign `PRG_PrimaryTask` to **PrimaryTask** (4ms, highest priority).

```pascal
PROGRAM PRG_PrimaryTask
VAR
    CommWd     : TON;       // Comm-alive watchdog timer
    HB_Last    : UINT;      // Last seen Heartbeat_Ctr value

    WebRise    : BOOL;      // Rising edge of raw web command
    WebPrev    : BOOL;
    ResetArmed : BOOL;

    TempOver   : BOOL;
    MV_Limited : REAL;

    HMI_PID_Update_Prev : BOOL;
    HMI_PID_Update_Rise : BOOL;
END_VAR
```

```pascal
(*
    PRG_PrimaryTask
    - G_*   = values from web/gateway (via CommTask → Modbus registers)
    - HMI_* = values from local NA5 HMI (via Sysmac variable mapping)
    - G_Eff_* = arbitrated effective commands consumed by ControlTask
*)

// ---------------------------------------------------------
// 0) Mode decode (used by this task only for consistent naming)
// ---------------------------------------------------------
// (Mode constants C_MODE_MANUAL=0, C_MODE_AUTO=1, C_MODE_TUNE=2
//  are used in ControlTask; PrimaryTask just passes G_Eff_Mode through)

// ---------------------------------------------------------
// 1) COMM ALIVE watchdog
//    Heartbeat_Ctr increments in CommTask on every Modbus transaction.
//    If no new heartbeat within 2s → G_CommAlive = FALSE → no web takeover.
// ---------------------------------------------------------
IF Heartbeat_Ctr <> HB_Last THEN
    HB_Last := Heartbeat_Ctr;
    CommWd(IN := FALSE);    // reset TON on activity
END_IF;

CommWd(IN := TRUE, PT := T#2s);
G_CommAlive := NOT CommWd.Q;

// ---------------------------------------------------------
// 2) Edge detection for HMI Apply button (PID parameter confirm)
// ---------------------------------------------------------
HMI_PID_Update_Rise := (HMI_PID_Update AND NOT HMI_PID_Update_Prev);
HMI_PID_Update_Prev := HMI_PID_Update;

// ---------------------------------------------------------
// 3) Web takeover decision
//    Web can only own control if gateway comms are alive.
//    Prevents PLC being stuck in "web mode" if gateway dies.
// ---------------------------------------------------------
G_WebActive := (G_Web_Status <> 0) AND G_CommAlive;

// ---------------------------------------------------------
// 4) Select EFFECTIVE commands (Web vs Local HMI)
//    Continuous scan when G_WebActive — safe because G_* only changes
//    when gateway explicitly writes new Modbus data.
// ---------------------------------------------------------
IF G_WebActive THEN
    G_Eff_Mode       := G_Mode;
    G_Eff_PLC_Enable := (G_PLC_Status <> 0);
    G_Eff_Setpoint   := G_Setpoint;
    G_Eff_Manual_MV  := G_Manual_MV;
    G_Eff_TuneCmd    := (G_Tune_Cmd <> 0);
ELSE
    // Local NA5 takeover when web is off or comm lost
    G_Eff_Mode       := HMI_Mode;
    G_Eff_PLC_Enable := HMI_PLC_Enable;
    G_Eff_Setpoint   := HMI_Setpoint;
    G_Eff_Manual_MV  := HMI_Manual_MV;
    G_Eff_TuneCmd    := HMI_TuneCmd;
END_IF;

// ---------------------------------------------------------
// 5) PID parameter latch (asymmetric by design)
//
//    Web:  latch every scan — OK because G_PID_PB/Ti/Td only changes
//          when operator explicitly clicks "Send" on dashboard.
//          Gateway writes HR11-16 → CommTask unpacks → G_PID_*
//
//    HMI:  HMI_PID_PB/Ti/Td change as operator types in DataEdit.
//          Must NOT flow continuously — gate on Apply button rising edge.
//
//    "If neither" path: G_Eff_PID_* retains last value (built-in latch).
// ---------------------------------------------------------
IF G_WebActive THEN
    G_Eff_PID_PB := G_PID_PB;
    G_Eff_PID_Ti := G_PID_Ti;
    G_Eff_PID_Td := G_PID_Td;
ELSIF HMI_PID_Update_Rise THEN
    G_Eff_PID_PB := HMI_PID_PB;
    G_Eff_PID_Ti := HMI_PID_Ti;
    G_Eff_PID_Td := HMI_PID_Td;

    HMI_PID_Update_Feedback := TRUE;    // flash confirmation on NA5 page
END_IF;

// Clear feedback when button released
IF NOT HMI_PID_Update THEN
    HMI_PID_Update_Feedback := FALSE;
END_IF;

// ---------------------------------------------------------
// 6) Overheat latch  (Trip at >100°C)
//    Reset requires: Web OFF → Web ON (operator must acknowledge via web)
// ---------------------------------------------------------
TempOver := (G_RTD_Temp > 100.0);

IF TempOver THEN
    G_OverheatLatched := TRUE;
END_IF;

// Arm reset only when web is off
IF (G_Web_Status = 0) THEN
    ResetArmed := TRUE;
END_IF;

// Rising edge of raw web command (not G_WebActive — runs independently of CommAlive)
WebRise := ((G_Web_Status <> 0) AND (NOT WebPrev));
WebPrev := (G_Web_Status <> 0);

// Clear latch on Web OFF → ON transition (requires prior arm)
IF WebRise AND ResetArmed THEN
    G_OverheatLatched := FALSE;
    ResetArmed        := FALSE;
END_IF;

// ---------------------------------------------------------
// 7) Final output gating + PWM
//    MV_percent is produced by ControlTask; PrimaryTask just clamps + drives output.
//    PWM runs at 4ms resolution with 1s period → clean time-proportional control.
// ---------------------------------------------------------
IF (NOT G_Eff_PLC_Enable) OR G_OverheatLatched THEN
    MV_Limited := 0.0;
ELSE
    IF MV_percent < 0.0        THEN MV_Limited := 0.0;
    ELSIF MV_percent > 100.0   THEN MV_Limited := 100.0;
    ELSE                             MV_Limited := MV_percent;
    END_IF;
END_IF;

PWM_Out(
    Ain    := MV_Limited,   // check exact input name in your TimeProportionalOut FB
    CtlPrd := T#1s,
    DOut   => Out_3
);

// Belt-and-braces: force output off on any overheat trip
IF G_OverheatLatched THEN
    Out_3 := FALSE;
END_IF;

// Stack lights
Out_2 := G_OverheatLatched;                                     // Red   = trip
Out_1 := G_WebActive;                                           // Yellow = web control active
Out_0 := (G_Eff_PLC_Enable AND NOT G_OverheatLatched);         // Green  = running enabled

END_PROGRAM
```

---

## C) ControlTask (40ms) — PIDAT + MV Selection + Tune Feedback

Assign `PRG_ControlTask` to **ControlTask** (40ms, medium priority).

> **Rule:** This program reads **only** `G_Eff_*` globals. It never reads `G_PID_*` or `HMI_PID_*` directly — all source arbitration was done in PrimaryTask.

```pascal
PROGRAM PRG_ControlTask
VAR
    ManualMode  : BOOL;
    AutoMode    : BOOL;
    TuneMode    : BOOL;

    RunCmd      : BOOL;
    StartAT_Cmd : BOOL;

    PB_Active   : REAL;
    Ti_Active_s : REAL;
    Td_Active_s : REAL;
    Ti_Time     : TIME;
    Td_Time     : TIME;

    MV_fromPID  : REAL;

    ATDone_FB   : BOOL;
    ATBusy_FB   : BOOL;
    ATErr_FB    : BOOL;
    ATErrID_FB  : UDINT;

    OprSetParams  : PID_OprParams;    // set CycleTime = 40ms in init
    InitSetParams : PID_InitParams;

    PIDAT_instance : PIDAT;
END_VAR
```

```pascal
(*
    PRG_ControlTask
    - Reads ONLY G_Eff_* (arbitrated by PrimaryTask)
    - Outputs: MV_percent (→PrimaryTask clamp+PWM), G_Current_MV, G_PID_*_Out
*)

// ---------------------------------------------------------
// 0) Mode decode
// ---------------------------------------------------------
ManualMode := (G_Eff_Mode = C_MODE_MANUAL);    // 0
AutoMode   := (G_Eff_Mode = C_MODE_AUTO);      // 1
TuneMode   := (G_Eff_Mode = C_MODE_TUNE);      // 2

// ---------------------------------------------------------
// 1) Run condition
//    ControlTask relies on PrimaryTask having already set G_Eff_PLC_Enable
//    and G_OverheatLatched.
// ---------------------------------------------------------
RunCmd := G_Eff_PLC_Enable AND (NOT G_OverheatLatched);

// ---------------------------------------------------------
// 2) PID parameter source — directly from G_Eff_PID_* (latched in PrimaryTask)
//    No G_PID_* or HMI_PID_* reads here.
// ---------------------------------------------------------
PB_Active   := G_Eff_PID_PB;
Ti_Active_s := G_Eff_PID_Ti;
Td_Active_s := G_Eff_PID_Td;

// ---------------------------------------------------------
// 3) Clamp and convert REAL seconds → TIME for PIDAT inputs
// ---------------------------------------------------------
IF Ti_Active_s < 0.0       THEN Ti_Active_s := 0.0;     END_IF;
IF Ti_Active_s > 10000.0   THEN Ti_Active_s := 10000.0; END_IF;
IF Td_Active_s < 0.0       THEN Td_Active_s := 0.0;     END_IF;
IF Td_Active_s > 10000.0   THEN Td_Active_s := 10000.0; END_IF;

// Round to nearest second (PIDAT accepts TIME, not REAL)
Ti_Time := SecToTime(REAL_TO_LINT(Ti_Active_s + 0.5));
Td_Time := SecToTime(REAL_TO_LINT(Td_Active_s + 0.5));

// ---------------------------------------------------------
// 4) Auto-tune trigger
// ---------------------------------------------------------
StartAT_Cmd := TuneMode AND RunCmd AND G_Eff_TuneCmd;

// ---------------------------------------------------------
// 5) PIDAT function block call
//    OprSetParams.CycleTime must = 40ms (ControlTask interval)
// ---------------------------------------------------------
PIDAT_instance(
    Run              := RunCmd,
    ManCtl           := ManualMode,         // TRUE = manual, FALSE = auto/tune
    StartAT          := StartAT_Cmd,
    PV               := G_RTD_Temp,
    SP               := G_Eff_Setpoint,

    OprSetParams     := OprSetParams,
    InitSetParams    := InitSetParams,

    ProportionalBand := PB_Active,
    IntegrationTime  := Ti_Time,
    DerivativeTime   := Td_Time,

    ManMV            := G_Eff_Manual_MV,

    ATDone           => ATDone_FB,
    ATBusy           => ATBusy_FB,
    Error            => ATErr_FB,
    ErrorID          => ATErrID_FB,

    MV               => MV_fromPID
);

// ---------------------------------------------------------
// 6) Final MV selection
// ---------------------------------------------------------
IF NOT RunCmd THEN
    MV_percent   := 0.0;
    G_Current_MV := 0.0;
ELSE
    IF ManualMode THEN
        MV_percent   := G_Eff_Manual_MV;
        G_Current_MV := G_Eff_Manual_MV;
    ELSE
        MV_percent   := MV_fromPID;
        G_Current_MV := MV_fromPID;
    END_IF;
END_IF;

// ---------------------------------------------------------
// 7) PID parameter reporting  →  CommTask packs into HR105-110
//
//    After AutoTune completes, PB_Active/Ti_Active_s/Td_Active_s hold
//    the values that PIDAT was running with (input params, not FB-computed).
//    Report these so the gateway can display them.
//
//    IMPORTANT: G_Eff_PID_* is NOT automatically overwritten here.
//    Operator must explicitly re-send (web "Send" → HR11-16) or
//    re-apply (NA5 Apply button → HMI_PID_Update_Rise) to activate new tune.
// ---------------------------------------------------------
IF ATDone_FB THEN
    G_PID_PB_Out := PB_Active;
    G_PID_Ti_Out := Ti_Active_s;
    G_PID_Td_Out := Td_Active_s;
ELSE
    // Normal: report what is currently active
    G_PID_PB_Out := G_Eff_PID_PB;
    G_PID_Ti_Out := G_Eff_PID_Ti;
    G_PID_Td_Out := G_Eff_PID_Td;
END_IF;

// ---------------------------------------------------------
// 8) Tune status feedback → CommTask packs into HR104, Tune_Busy, Tune_Err
// ---------------------------------------------------------
IF ATDone_FB THEN G_Tune_Done := WORD#1; ELSE G_Tune_Done := WORD#0; END_IF;
IF ATBusy_FB THEN G_Tune_Busy := WORD#1; ELSE G_Tune_Busy := WORD#0; END_IF;
IF ATErr_FB  THEN G_Tune_Err  := WORD#1; ELSE G_Tune_Err  := WORD#0; END_IF;

END_PROGRAM
```

---

## D) Notes for Sysmac Studio

| Item | Setting |
| :--- | :--- |
| `OprSetParams.CycleTime` | **40ms** — must match ControlTask interval |
| `CommTask` interval | 100ms is fine — gateway polls at ~100ms |
| `PrimaryTask` interval | 4ms — ensures clean 1s PWM timing |
| `PWM_Out` FB | Call **only in PrimaryTask** (not ControlTask) |
| `PIDAT_instance` | Call **only in ControlTask** |
| NA5 variable mapping | HMI_* must be **global** (not local to any program) |
