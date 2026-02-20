Yep — your Markdown went “out of control” because the **ControlTask block isn’t wrapped in a fenced code block**, and some lines like `PROGRAM PRG_ControlTask` are being interpreted as normal text instead of code.

Here’s a **clean, copy-paste ready** version (all code sections are properly fenced). You can paste this directly into your `.md` file.

---

## 2) PLC side: PrimaryTask (4ms) + ControlTask (40ms) to work with CommTask (100ms)

You now have:

* **Web dashboard** → calls Gateway REST endpoints (`/web/on`, `/plc/on`, `/mode/...`, `/setpoint`, `/mv_manual`, `/tune_start`, `/pid`, etc.)
* **Gateway** stores to SQLite, then `service_modbus.py` (Modbus **CLIENT**) writes **HR0..HR16** and reads **HR100..HR110**
* **PLC** is Modbus **SERVER** (your `MB_Server(...)` in CommTask) and parses the new sequence

### Key idea for task split

* **CommTask (100ms, low priority):** only comm + unpack/pack registers
* **ControlTask (40ms, mid):** PIDAT + MV selection + tune logic
* **PrimaryTask (4ms, top):** safety, takeover arbitration, watchdog, PWM output, hard interlocks

This design includes the **overheat latch that requires Web OFF→ON to reset**.

---

## A) Add a few helper globals (recommended)

```iecst
VAR_GLOBAL
    // Derived / effective commands (chosen from Web or Local HMI)
    G_Eff_Mode        : INT;   // 0 manual, 1 auto, 2 tune
    G_Eff_PLC_Enable  : BOOL;  // final enable request (before safety)
    G_Eff_Setpoint    : REAL;
    G_Eff_Manual_MV   : REAL;
    G_Eff_TuneCmd     : BOOL;

    // Health / safety
    G_CommAlive       : BOOL;
    G_OverheatLatched : BOOL;

    // (Optional) Local HMI commands if Web is OFF
    HMI_Mode       : INT;
    HMI_PLC_Enable : BOOL;
    HMI_Setpoint   : REAL;
    HMI_Manual_MV  : REAL;
    HMI_TuneCmd    : BOOL;

    // Tune feedback to gateway (Modbus HR-friendly)
    G_Tune_Done : WORD;   // 0/1
    G_Tune_Busy : WORD;   // 0/1
    G_Tune_Err  : WORD;   // 0/1
END_VAR
```

> If your NA5 already uses different tag names, just map those instead of `HMI_*`.

---

## B) PrimaryTask (4ms) — Safety + Takeover + PWM

Assign a program like `PRG_PrimaryTask` into **PrimaryTask** (4ms, highest priority):

```iecst
PROGRAM PRG_PrimaryTask
VAR
    WebActive      : BOOL;
    WebRise        : BOOL;
    WebPrev        : BOOL;

    ResetArmed     : BOOL;

    HB_Last        : UINT;
    CommWd         : TON;      // watchdog timer
    MV_Limited     : REAL;

    TempOver       : BOOL;
END_VAR

// ---------------------------------------------------------
// 1) COMM ALIVE watchdog (uses Heartbeat_Ctr that increments on Modbus traffic)
// ---------------------------------------------------------
IF UINT_TO_UINT(Heartbeat_Ctr) <> HB_Last THEN
    HB_Last := UINT_TO_UINT(Heartbeat_Ctr);
    CommWd(IN := FALSE); // reset TON
END_IF;

CommWd(IN := TRUE, PT := T#2s);
G_CommAlive := NOT CommWd.Q;

// ---------------------------------------------------------
// 2) Web takeover decision (require comm alive if Web wants control)
// ---------------------------------------------------------
WebActive := (G_Web_Status <> 0) AND G_CommAlive;

// ---------------------------------------------------------
// 3) Select EFFECTIVE commands (Web vs Local HMI)
// ---------------------------------------------------------
IF WebActive THEN
    G_Eff_Mode       := G_Mode;
    G_Eff_PLC_Enable := (G_PLC_Status <> 0);
    G_Eff_Setpoint   := G_Setpoint;
    G_Eff_Manual_MV  := G_Manual_MV;
    G_Eff_TuneCmd    := (G_Tune_Cmd <> 0);
ELSE
    // Local / NA5 takeover when Web is off
    G_Eff_Mode       := HMI_Mode;
    G_Eff_PLC_Enable := HMI_PLC_Enable;
    G_Eff_Setpoint   := HMI_Setpoint;
    G_Eff_Manual_MV  := HMI_Manual_MV;
    G_Eff_TuneCmd    := HMI_TuneCmd;
END_IF;

// ---------------------------------------------------------
// 4) Overheat latch (Trip at >100C, require Web OFF->ON to reset)
// ---------------------------------------------------------
TempOver := (G_RTD_Temp > 100.0);

IF TempOver THEN
    G_OverheatLatched := TRUE;
END_IF;

// Rising edge detect of raw Web command (not WebActive)
WebRise := ( (G_Web_Status <> 0) AND (NOT WebPrev) );
WebPrev := (G_Web_Status <> 0);

// Arm reset when Web is OFF
IF (G_Web_Status = 0) THEN
    ResetArmed := TRUE;
END_IF;

// Clear latch only when Web toggles OFF then ON
IF WebRise AND ResetArmed THEN
    G_OverheatLatched := FALSE;
    ResetArmed := FALSE;
END_IF;

// ---------------------------------------------------------
// 5) Final output gating + PWM
// ---------------------------------------------------------
IF (NOT G_Eff_PLC_Enable) OR G_OverheatLatched THEN
    MV_Limited := 0.0;
ELSE
    // MV_percent is produced in ControlTask; just clamp here
    IF MV_percent < 0.0 THEN MV_Limited := 0.0;
    ELSIF MV_percent > 100.0 THEN MV_Limited := 100.0;
    ELSE MV_Limited := MV_percent;
    END_IF;
END_IF;

// Call your TimeProportionalOut FB every 4ms for clean timing
PWM_Out(
    MV     := MV_Limited,
    CtlPrd := T#1s,
    DOut   => Out_3
);

// Absolute safety override
IF G_OverheatLatched THEN
    Out_3 := FALSE;
END_IF;

// (Optional) stack lights
Out_2 := G_OverheatLatched;     // Red = trip
Out_1 := WebActive;             // Yellow = web control
Out_0 := (G_Eff_PLC_Enable AND NOT G_OverheatLatched); // Green = running enabled
END_PROGRAM
```

---

## C) ControlTask (40ms) — PIDAT + MV selection + Tune

Assign `PRG_ControlTask` into **ControlTask** (40ms, medium priority):

```iecst
PROGRAM PRG_ControlTask
VAR
    RunCmd      : BOOL;
    ManualMode  : BOOL;
    TuneMode    : BOOL;

    StartAT_Cmd : BOOL;

    PB_Active    : REAL;
    Ti_Active_s  : REAL;
    Td_Active_s  : REAL;

    Ti_Time      : TIME;
    Td_Time      : TIME;

    MV_fromPID   : REAL;

    // PIDAT outputs (local)
    ATDone_FB  : BOOL;
    ATBusy_FB  : BOOL;
    ATErr_FB   : BOOL;
    ATErrID_FB : UDINT;   // adjust to your library’s actual type if needed
END_VAR

// ---------------------------------------------------------
// 1) Mode decode
// ---------------------------------------------------------
ManualMode := (G_Eff_Mode = 0);
TuneMode   := (G_Eff_Mode = 2);

// ---------------------------------------------------------
// 2) Run condition
// ---------------------------------------------------------
RunCmd := G_Eff_PLC_Enable AND (NOT G_OverheatLatched);

// ---------------------------------------------------------
// 3) PID parameter source (REAL seconds stored for web/modbus)
// ---------------------------------------------------------
IF NOT TuneMode THEN
    G_PID_PB_Out := G_PID_PB;    // REAL
    G_PID_Ti_Out := G_PID_Ti;    // REAL seconds
    G_PID_Td_Out := G_PID_Td;    // REAL seconds
END_IF;

PB_Active   := G_PID_PB_Out;
Ti_Active_s := G_PID_Ti_Out;
Td_Active_s := G_PID_Td_Out;

// ---------------------------------------------------------
// 3b) Convert REAL seconds -> TIME (seconds resolution via SecToTime)
// ---------------------------------------------------------
IF Ti_Active_s < 0.0 THEN Ti_Active_s := 0.0; END_IF;
IF Ti_Active_s > 10000.0 THEN Ti_Active_s := 10000.0; END_IF;

IF Td_Active_s < 0.0 THEN Td_Active_s := 0.0; END_IF;
IF Td_Active_s > 10000.0 THEN Td_Active_s := 10000.0; END_IF;

// Round to nearest second
Ti_Time := SecToTime( REAL_TO_LINT(Ti_Active_s + 0.5) );
Td_Time := SecToTime( REAL_TO_LINT(Td_Active_s + 0.5) );

// ---------------------------------------------------------
// 4) Auto-tune trigger (simple model)
//   - Gateway keeps G_Eff_TuneCmd=TRUE until it reads TuneDone=1
// ---------------------------------------------------------
StartAT_Cmd := TuneMode AND RunCmd AND G_Eff_TuneCmd;

// ---------------------------------------------------------
// 5) Call PIDAT (ControlTask = 40ms)
// ---------------------------------------------------------
PIDAT_instance(
    Run              := RunCmd,
    ManCtl           := ManualMode,          // TRUE=manual, FALSE=auto/tune
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
// 7) Tune feedback to Gateway (WORD for Modbus)
// ---------------------------------------------------------
IF ATDone_FB THEN G_Tune_Done := WORD#1; ELSE G_Tune_Done := WORD#0; END_IF;
IF ATBusy_FB THEN G_Tune_Busy := WORD#1; ELSE G_Tune_Busy := WORD#0; END_IF;
IF ATErr_FB  THEN G_Tune_Err  := WORD#1; ELSE G_Tune_Err  := WORD#0; END_IF;

END_PROGRAM
```

---

## Notes for Sysmac Studio

* Put **PWM_Out** FB call only in **PrimaryTask** (not in ControlTask), so 1s time-proportioning is smooth.
* Ensure `OprSetParams` cycle time matches **40ms** so PIDAT behaves correctly.
* CommTask (100ms) is OK because gateway polls at **0.1s** (`MODBUS_UPDATE_INTERVAL = 0.1`).

---
