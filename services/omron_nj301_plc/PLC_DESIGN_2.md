### 1) Camera stream: 3 viewers + “too good” quality

I looked at your Radxa camera service (`services/radxa3w_camera/app.py` + `camera_app.service`).

**What happens with 3 devices watching at the same time?**

* Your `/video_feed` is an **MJPEG stream** (an infinite generator). **Each viewer holds one Gunicorn thread forever**.
* Your systemd service runs: `gunicorn ... --threads 2` (and default workers = 1).
* So **only ~2 simultaneous viewers** can stream smoothly. The **3rd viewer will likely hang, connect very slowly, or time out** because there isn’t a free thread.

✅ Fix (simple): increase concurrency in `camera_app.service`, e.g.

* **Option A (easy):** `--threads 4`
* **Option B (better isolation):** `--workers 2 --threads 2`  (total ~4 concurrent streams)

**About compressing to half pixels**

* You’re already doing some compression:

  * capture pipeline is **640×480**
  * JPEG encoding uses `quality=60`
  * client stream is **~10 FPS** (`time.sleep(0.1)`)
* Reducing to **320×240** will reduce:

  * **CPU** (PIL JPEG encode time)
  * **bandwidth per viewer**
  * and it will generally **improve stability** over Cloudflare Tunnel / weaker networks, especially with multiple viewers.

So: **yes**, halving resolution will usually improve stability *and* allow more viewers before it struggles (but you still should increase Gunicorn threads/workers).

---

## 2) PLC side: PrimaryTask (4ms) + ControlTask (40ms) to work with your CommTask (100ms)

You now have:

* **Web dashboard** → calls Gateway REST endpoints (`/web/on`, `/plc/on`, `/mode/...`, `/setpoint`, `/mv_manual`, `/tune_start`, `/pid`, etc.)
* **Gateway** stores to SQLite, then `service_modbus.py` (Modbus **CLIENT**) writes **HR0..HR16** and reads **HR100..HR110**
* **PLC** is Modbus **SERVER** (your `MB_Server(...)` in CommTask) and parses new sequence

### Key idea for task split

* **CommTask (100ms, low priority):** only comm + unpack/pack registers (you already did)
* **ControlTask (40ms, mid):** PIDAT + MV selection + tune logic
* **PrimaryTask (4ms, top):** safety, takeover arbitration, watchdog, PWM output, hard interlocks

Below is a clean way to implement your requirements (including the **overheat latch that requires Web OFF→ON to reset**).

---

# A) Add a few helper globals (recommended)

Add these globals (names are suggestions, keep yours if you prefer):

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
END_VAR
```

> If your NA5 already writes different tag names, just map those instead of `HMI_*`.

---

# B) PrimaryTask (4ms) — Safety + Takeover + PWM

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
// 1) COMM ALIVE watchdog (uses your Heartbeat_Ctr that increments on Modbus traffic)
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
    MV     := MV_Limited,     // adjust input name if different in your FB
    CtlPrd := T#1s,
    DOut   => Out_3
);

// Absolute safety override (belt + braces)
IF G_OverheatLatched THEN
    Out_3 := FALSE;
END_IF;

// (Optional) stack lights
Out_2 := G_OverheatLatched;     // Red = trip
Out_1 := WebActive;             // Yellow = web control
Out_0 := (G_Eff_PLC_Enable AND NOT G_OverheatLatched); // Green = running enabled
END_PROGRAM
```

**Why this works well**

* PWM timing stays “tight” (4ms task)
* Even if ControlTask misbehaves, PrimaryTask can force `Out_3 = FALSE`
* Web takeover is automatically dropped if comm stalls (`G_CommAlive = FALSE`)

---

# C) ControlTask (40ms) — PIDAT + MV selection + Tune

Assign `PRG_ControlTask` into **ControlTask** (40ms, medium priority):

```iecst
PROGRAM PRG_ControlTask
VAR
    RunCmd      : BOOL;
    ManualMode  : BOOL;
    TuneMode    : BOOL;

    StartAT_Cmd : BOOL;

    MV_fromPID  : REAL;

    // Optional: keep active params separate
    PB_Active   : REAL;
    Ti_Active   : REAL;
    Td_Active   : REAL;
END_VAR

// ---------------------------------------------------------
// 1) Mode decode
// ---------------------------------------------------------
ManualMode := (G_Eff_Mode = 0);
TuneMode   := (G_Eff_Mode = 2);

// ---------------------------------------------------------
// 2) Run condition (already selected Web/Local in PrimaryTask)
// ---------------------------------------------------------
RunCmd := G_Eff_PLC_Enable AND (NOT G_OverheatLatched);

// ---------------------------------------------------------
// 3) PID parameter source
//    - Normal: use command values from gateway (G_PID_*)
//    - During tuning: allow tuned values to become the “Out” values
// ---------------------------------------------------------
IF NOT TuneMode THEN
    // follow commanded parameters
    G_PID_PB_Out := G_PID_PB;
    G_PID_Ti_Out := G_PID_Ti;
    G_PID_Td_Out := G_PID_Td;
END_IF;

PB_Active := G_PID_PB_Out;
Ti_Active := G_PID_Ti_Out;
Td_Active := G_PID_Td_Out;

// ---------------------------------------------------------
// 4) Auto-tune trigger
//    StartAT runs while TuneMode + TuneCmd, and stops after ATDone
// ---------------------------------------------------------
StartAT_Cmd := TuneMode AND G_Eff_TuneCmd AND RunCmd AND (NOT PIDAT_instance.ATDone);

// ---------------------------------------------------------
// 5) Call PIDAT (40ms task = good for thermal control)
//    IMPORTANT: set OprSetParams cycle time = 40ms in your init/vars
// ---------------------------------------------------------
PIDAT_instance(
    Run            := RunCmd,
    ManCtl         := ManualMode,          // TRUE=manual, FALSE=auto/tune
    StartAT        := StartAT_Cmd,
    PV             := G_RTD_Temp,
    SP             := G_Eff_Setpoint,

    OprSetParams   := OprSetParams,        // your struct
    InitSetParams  := InitSetParams,       // your struct (InitType can be tied to mode if you want)

    ProportionalBand := PB_Active,
    IntegrationTime  := Ti_Active,
    DerivativeTime   := Td_Active,

    ManMV          := G_Eff_Manual_MV,

    ATDone         => ,
    ATBusy         => ,
    Error          => ,
    ErrorID        => ,
    MV             => MV_fromPID
);

// ---------------------------------------------------------
// 6) Decide the final MV_percent + G_Current_MV
// ---------------------------------------------------------
IF NOT RunCmd THEN
    MV_percent   := 0.0;
    G_Current_MV := 0.0;
ELSE
    // PIDAT should output MV=ManMV when ManCtl=TRUE, but we keep logic explicit
    IF ManualMode THEN
        MV_percent   := G_Eff_Manual_MV;
        G_Current_MV := G_Eff_Manual_MV;
    ELSE
        MV_percent   := MV_fromPID;
        G_Current_MV := MV_fromPID;
    END_IF;
END_IF;

// ---------------------------------------------------------
// 7) Tune feedback to Gateway
// ---------------------------------------------------------
IF PIDAT_instance.ATDone THEN
    G_Tune_Done := 1;
ELSE
    G_Tune_Done := 0;
END_IF;
END_PROGRAM
```

### Notes you should apply in Sysmac Studio

* Put **PWM_Out** FB call only in **PrimaryTask** (not in ControlTask), so the 1s time-proportioning is smooth.
* Ensure `OprSetParams` (PIDAT) has the correct cycle time (40ms) so integral/derivative behave as expected.
* Your CommTask (100ms) is fine for Modbus here because the Gateway also polls at **0.1s** (`MODBUS_UPDATE_INTERVAL = 0.1`).

---

If you paste (or screenshot) your PIDAT `OprSetParams` / `InitSetParams` structs fields (the exact names Sysmac shows), I can adjust the ControlTask call so the **InitType mapping (0/1/2)** matches exactly how Omron expects it in your project.
