(*
    ControlTask_PID
    - With HMI_PID_Update apply button
    - 
*)


// ---------------------------------------------------------
// 2) Run condition (already selected Web/Local in PrimaryTask)
// ---------------------------------------------------------
RunCmd := G_Eff_PLC_Enable AND (NOT G_OverheatLatched);

// ---------------------------------------------------------
// 3) PID parameter source (REAL seconds stored for web/modbus)
// ---------------------------------------------------------
PB_Active   := G_Eff_PID_PB;
Ti_Active_s := G_Eff_PID_Ti;
Td_Active_s := G_Eff_PID_Td;

// ---------------------------------------------------------
// 3b) Convert REAL seconds -> TIME (milliseconds resolution)
// ---------------------------------------------------------
// Ti_Active_s, Td_Active_s are REAL seconds (from dashboard)
IF Ti_Active_s < 0.0 THEN Ti_Active_s := 0.0; END_IF;
IF Ti_Active_s > 10000.0 THEN Ti_Active_s := 10000.0; END_IF;

IF Td_Active_s < 0.0 THEN Td_Active_s := 0.0; END_IF;
IF Td_Active_s > 10000.0 THEN Td_Active_s := 10000.0; END_IF;

// REAL seconds -> TIME (seconds resolution)
Ti_Time := SecToTime( REAL_TO_LINT(Ti_Active_s + 0.5) );
Td_Time := SecToTime( REAL_TO_LINT(Td_Active_s + 0.5) );

// ---------------------------------------------------------
// 4) Auto-tune trigger
// ---------------------------------------------------------
StartAT_Cmd := G_Mode_AT AND RunCmd AND G_Eff_AT_Request;

// ---------------------------------------------------------
// 5) Call PIDAT (40ms task = good for thermal control)
//    IMPORTANT: set OprSetParams cycle time = 40ms in your init/vars
// ---------------------------------------------------------
PIDAT_instance(
    Run            := RunCmd,
    ManCtl         := G_Mode_Manual,          // TRUE=manual, FALSE=auto/tune
    StartAT        := StartAT_Cmd,
    PV             := G_RTD_Temp,
    SP             := G_Eff_Setpoint,

    OprSetParams   := OprSetParams,        // your struct
    InitSetParams  := InitSetParams,       // your struct (InitType can be tied to mode if you want)

    ProportionalBand := PB_Active,
    IntegrationTime  := Ti_Time,
    DerivativeTime   := Td_Time,

    ManMV          := G_Eff_Manual_MV,
	
	ATDone  => ATDone_FB,
    ATBusy  => ATBusy_FB,
    Error   => ATErr_FB,
    ErrorID => ATErrID_FB,
    MV      => MV_fromPID

);

// ---------------------------------------------------------
// 6) Decide the final MV (single source of truth)
// ---------------------------------------------------------
IF NOT RunCmd THEN
    G_Current_MV := 0.0;
ELSE
    IF G_Mode_Manual THEN
        G_Current_MV := G_Eff_Manual_MV;
    ELSE
        G_Current_MV := MV_fromPID;
    END_IF;
END_IF;
// ---------------------------------------------------------
// 7) After AutoTune: capture tuned params for reporting
//     DO NOT push to G_Eff_PID_* automatically.
//     Operator must explicitly re-Apply (web Send / HMI Apply button).
// ---------------------------------------------------------
ATDone_Rise := ATDone_FB AND NOT ATDone_Prev;   // one-shot
ATDone_Prev := ATDone_FB;

IF ATDone_FB THEN
    G_PID_PB_Out := PB_Active;    // or read from PIDAT output if available
    G_PID_Ti_Out := Ti_Active_s;
    G_PID_Td_Out := Td_Active_s;
    G_Tune_Done  := WORD#1;
ELSE
    // Normal operation: report what's currently active
    G_PID_PB_Out := G_Eff_PID_PB;
    G_PID_Ti_Out := G_Eff_PID_Ti;
    G_PID_Td_Out := G_Eff_PID_Td;
    G_Tune_Done  := WORD#0;
END_IF;

IF ATBusy_FB THEN G_Tune_Busy := WORD#1; ELSE G_Tune_Busy := WORD#0; END_IF;
IF ATErr_FB  THEN G_Tune_Err  := WORD#1; ELSE G_Tune_Err  := WORD#0; END_IF;

// --- Auto-fill DataEdit on rising edge of ATDone (local mode only) ---
// Triggers ONCE when tuning completes. Operator can then edit freely.
IF ATDone_Rise AND NOT G_WebActive THEN
    HMI_PID_PB := G_PID_PB_Out;
    HMI_PID_Ti := G_PID_Ti_Out;
    HMI_PID_Td := G_PID_Td_Out;
END_IF;
