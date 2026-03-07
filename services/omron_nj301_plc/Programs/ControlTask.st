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
// 4) Call PIDAT (40ms task = good for thermal control)
//    IMPORTANT: set OprSetParams cycle time = 40ms in your init/vars
// ---------------------------------------------------------
PIDAT_instance(
    Run            := RunCmd,
    ManCtl         := G_Mode_Manual,          // TRUE=manual, FALSE=auto/tune
    StartAT        := G_Eff_StartAT,
    PV             := G_RTD_Temp,
    SP             := G_Eff_Setpoint,
    OprSetParams   := OprSetParams,        // your struct
    InitSetParams  := InitSetParams,       // your struct (InitType can be tied to mode if you want)
    ProportionalBand := PB_Active,
    IntegrationTime  := Ti_Time,
    DerivativeTime   := Td_Time,
    ManMV          := G_Eff_Manual_MV,	
	ATDone  => G_ATDone_FB,
    ATBusy  => ATBusy_FB,
    Error   => ATErr_FB,
    ErrorID => ATErrID_FB,
    MV      => MV_fromPID
);

// ---------------------------------------------------------
// 5) Decide the final MV (single source of truth)
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
// 6) Detect autotune completion
// ---------------------------------------------------------
ATDone_Rise := G_ATDone_FB AND NOT ATDone_Prev;
ATDone_Prev := G_ATDone_FB;

IF ATDone_Rise THEN

    // Capture tuned parameters
    G_PID_PB_AT := PB_Active;
	
	 // Convert TIME -> REAL seconds
    G_PID_Ti_AT := LINT_TO_REAL(TimeToLINT(Ti_Time)) / 1000.0;
    G_PID_Td_AT := LINT_TO_REAL(TimeToLINT(Td_Time)) / 1000.0;



    // Reset autotune command
    IF G_WebActive THEN
        G_StartAT := 0;
    ELSE
        HMI_StartAT := FALSE;
    END_IF;
END_IF;

// ---------------------------------------------------------
// 7) Report current active PID to web
// ---------------------------------------------------------
G_PID_PB_Out := G_Eff_PID_PB;
G_PID_Ti_Out := G_Eff_PID_Ti;
G_PID_Td_Out := G_Eff_PID_Td;


IF ATBusy_FB THEN G_ATBusy := WORD#1; ELSE G_ATBusy := WORD#0; END_IF;
IF ATErr_FB  THEN G_Tune_Err  := WORD#1; ELSE G_Tune_Err  := WORD#0; END_IF;


