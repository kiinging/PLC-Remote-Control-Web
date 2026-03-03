(*
    PrimaryTask+Main
	- G_PID_* → web buffer (read from the modbus HR)
	- G_Eff_PID_* → used by ControlTask
	- HMI_PID_* → operator entry values
	- G_PID_*_Out → actual running PID parameters (write to the modbus HR)
    - 
*)

G_Mode_Manual := (G_Eff_Mode = C_MODE_MANUAL);
G_Mode_Auto     := (G_Eff_Mode = C_MODE_AUTO);
G_Mode_AT         := (G_Eff_Mode = C_MODE_TUNE);

// First scan initialization
IF NOT FirstScanDone THEN
    // === First Scan Initialization ===
    G_Eff_PID_PB := G_PID_PB_Out;
    G_Eff_PID_Ti := G_PID_Ti_Out;
    G_Eff_PID_Td := G_PID_Td_Out;
    FirstScanDone := TRUE;
END_IF;

// ---------------------------------------------------------
// 0) COMM ALIVE watchdog (uses your Heartbeat_Ctr that increments on Modbus traffic)
// I (PLC) am confident comms are alive, so web takeover is allowed?
// this is to prevent the PLC won’t stay stuck in “web owns control” forever.
// ---------------------------------------------------------
IF Heartbeat_Ctr <> HB_Last THEN
    HB_Last := Heartbeat_Ctr;
    CommWd(IN := FALSE); // reset TON
END_IF;

CommWd(IN := TRUE, PT := T#2s);
G_CommAlive := NOT CommWd.Q;

// ---------------------------------------------------------
// 1) Edge detection for HMI_PID_Update (add this)
// ---------------------------------------------------------
HMI_PID_Update_Rise := (HMI_PID_Update AND NOT HMI_PID_Update_Prev);
HMI_PID_Update_Prev := HMI_PID_Update;

// ---------------------------------------------------------
// 1b) HMI_PLC_Enable Button Edge Detection
// ---------------------------------------------------------
HMI_Manual_Start_Rise := (HMI_Manual_Start AND NOT HMI_Manual_Start_Prev);
HMI_Manual_Stop_Rise  := (HMI_Manual_Stop  AND NOT HMI_Manual_Stop_Prev);

HMI_Manual_Start_Prev := HMI_Manual_Start;
HMI_Manual_Stop_Prev  := HMI_Manual_Stop;

HMI_Automatic_Start_Rise := (HMI_Automatic_Start AND NOT HMI_Automatic_Start_Prev);
HMI_Automatic_Stop_Rise  := (HMI_Automatic_Stop  AND NOT HMI_Automatic_Stop_Prev);

HMI_Automatic_Start_Prev := HMI_Automatic_Start;
HMI_Automatic_Stop_Prev  := HMI_Automatic_Stop;


// ---------------------------------------------------------
// 1c) HMI Auto-Tune Button Edge Detection
// ---------------------------------------------------------
HMI_AT_ON_Rise  := (HMI_AT_ON AND NOT HMI_AT_ON_Prev);
HMI_AT_OFF_Rise := (HMI_AT_OFF AND NOT HMI_AT_OFF_Prev);

HMI_AT_ON_Prev  := HMI_AT_ON;
HMI_AT_OFF_Prev := HMI_AT_OFF;

// ---------------------------------------------------------
// 2) Web takeover decision (require comm alive if Web wants control)
// ---------------------------------------------------------
G_WebActive := (G_Web_Status <> 0) AND G_CommAlive;

// ---------------------------------------------------------
// 3a) Select EFFECTIVE commands (Web vs Local HMI)
// - Continuous scan reading when G_WebActive is TRUE
// ---------------------------------------------------------
IF G_WebActive THEN
    G_Eff_Mode          := G_Mode;
    G_Eff_PLC_Enable := (G_PLC_Status <> 0);
    G_Eff_Setpoint      := G_Setpoint;
    G_Eff_Manual_MV := G_Manual_MV;
    G_Eff_AT_Request    := (G_AT_Request <> 0);
ELSE
    // Local / NA5 takeover when Web is off
    G_Eff_Mode       := HMI_Mode;
    G_Eff_PLC_Enable := HMI_PLC_Enable;
    G_Eff_Setpoint   := HMI_Setpoint;
    G_Eff_Manual_MV  := HMI_Manual_MV;
    G_Eff_AT_Request    := HMI_AT_Request;
END_IF;

// ---------------------------------------------------------
// 3 b) HMI: latch ONLY on Apply button rising edge
// ---------------------------------------------------------
IF G_WebActive THEN
	G_Eff_PID_PB        := G_PID_PB;
    G_Eff_PID_Ti         := G_PID_Ti;
    G_Eff_PID_Td        := G_PID_Td;
ELSIF HMI_PID_Update_Rise THEN 	
    // HMI can adjust PID parameters - only on Apply button click
    G_Eff_PID_PB     := HMI_PID_PB;      // Copy HMI -> Web buffer
    G_Eff_PID_Ti      := HMI_PID_Ti;
    G_Eff_PID_Td     := HMI_PID_Td;
    
    // Optional: Provide feedback that parameters were applied
    HMI_PID_Update_Feedback := TRUE;  // flash confirmation on NA page
END_IF;
// If neither: EFF_PID_* retains its last value → built-in latch!

// Clear feedback next scan
IF NOT HMI_PID_Update_Rise THEN
    HMI_PID_Update_Feedback := FALSE;
END_IF;

// ---------------------------------------------------------
// 3c) HMI PLC_Enable  Latch Logic
// ---------------------------------------------------------
IF HMI_Manual_Start_Rise THEN
	HMI_Mode :=C_MODE_MANUAL;
    HMI_PLC_Enable := TRUE;
END_IF;

IF HMI_Manual_Stop_Rise THEN
    HMI_PLC_Enable := FALSE;
END_IF;

IF HMI_Automatic_Start_Rise THEN
	HMI_Mode := C_MODE_AUTO;
    HMI_PLC_Enable := TRUE;
END_IF;

IF HMI_Automatic_Stop_Rise THEN
    HMI_PLC_Enable := FALSE;
END_IF;
// ---------------------------------------------------------
// 3d) HMI Auto-Tune Latch Logic
// ---------------------------------------------------------
// Start tuning
IF HMI_AT_ON_Rise THEN
    HMI_AT_Request := TRUE;
END_IF;

// Stop tuning (operator interrupt)
IF HMI_AT_OFF_Rise THEN
    HMI_AT_Request := FALSE;
END_IF;


// ---------------------------------------------------------
// 4) Overheat latch (Trip at >100C, require Web OFF->ON to reset)
// ---------------------------------------------------------
TempOver := (G_RTD_Temp > 100.0);

IF TempOver THEN
    G_OverheatLatched := TRUE;
END_IF;

// Rising edge detect of raw Web command (not G_WebActive)
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
// 5) Final output gating + PWM (using G_Current_MV directly)
// ---------------------------------------------------------
IF (NOT G_Eff_PLC_Enable) OR G_OverheatLatched THEN
    MV_Limited := 0.0;
ELSE
    // Use G_Current_MV directly from ControlTask
    IF G_Current_MV < 0.0 THEN MV_Limited := 0.0;
    ELSIF G_Current_MV > 100.0 THEN MV_Limited := 100.0;
    ELSE MV_Limited := G_Current_MV;
    END_IF;
END_IF;

G_Heater_Power_W := (MV_Limited / 100.0) * 11.52;

// Call your TimeProportionalOut FB every 4ms for clean timing
PWM_Enable := G_Eff_PLC_Enable AND NOT G_OverheatLatched;
PWM_Out(
	Enable:=PWM_Enable,
    Ain     := MV_Limited,     // adjust input name if different in your FB
    CtlPrd := T#1s,
	MinPlsWidth :=0.0,
	Delay:=0.0,
    DOut   => Out_3
);

// Absolute safety override (belt + braces)
IF G_OverheatLatched THEN
    Out_3 := FALSE;
END_IF;

// ---------------------------------------------------------
// Stack lights logic (Mode-based)
// ---------------------------------------------------------
Out_0 := (G_Mode_Manual AND G_Eff_PLC_Enable AND NOT G_OverheatLatched);
Out_1 := (G_Mode_Auto   AND G_Eff_PLC_Enable AND NOT G_OverheatLatched);
Out_2 := (G_Mode_AT   AND G_Eff_PLC_Enable AND NOT G_OverheatLatched);