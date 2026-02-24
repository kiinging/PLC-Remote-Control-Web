# Omron NJ301 PLC Design Document — Part 1: Globals & CommTask

## 1. System Architecture

```
Web App  ──REST──►  Gateway (OrangePi) ──Modbus TCP CLIENT──►  PLC (Modbus TCP SERVER)
                                                                       │
                                         NA5 HMI ──Sysmac vars──►  PLC Globals
```

- **Gateway**: Modbus TCP Client (Master) — writes HR0..HR16, reads HR100..HR110
- **PLC**: Modbus TCP Server (Slave) — IP e.g. `192.168.0.134`, Port `1502`
- **NA5 HMI**: Connected via Sysmac Studio variable mapping (not Modbus)

---

## 2. Task Allocation

| Task Name | Priority | Interval | Purpose |
| :--- | :--- | :--- | :--- |
| **PrimaryTask** | 4 | 4ms | Safety, watchdog, arbitration (`G_Eff_*`), PWM output |
| **ControlTask** | 16 | 40ms | PIDAT loop, MV selection, tune feedback |
| **CommTask** | 17 | 100ms | Modbus TCP Server, pack/unpack registers |

---

## 3. Data Types & Globals

### 3a. Mode Constants (add to Global Constants)

```pascal
VAR_GLOBAL CONSTANT
    C_MODE_MANUAL : INT := 0;
    C_MODE_AUTO   : INT := 1;
    C_MODE_TUNE   : INT := 2;
END_VAR
```

### 3b. Modbus Register Map

| Modbus HR | Variable | Type | Direction | Description |
| :--- | :--- | :--- | :--- | :--- |
| **HR0** | `G_Seq_Num` | `WORD` | Gateway→PLC | Heartbeat / Sequence Counter |
| **HR1-2** | `G_RTD_Temp` | `REAL` | Gateway→PLC | Process Value (°C) from RTD |
| **HR3** | `G_Web_Status` | `INT` | Gateway→PLC | 0=web off, 1=web on |
| **HR4** | `G_Mode` | `INT` | Gateway→PLC | 0=Manual, 1=Auto, 2=Tune |
| **HR5** | `G_PLC_Status` | `INT` | Gateway→PLC | 0=disabled, 1=enabled |
| **HR6-7** | `G_Manual_MV` | `REAL` | Gateway→PLC | Manual MV command (%) |
| **HR8-9** | `G_Setpoint` | `REAL` | Gateway→PLC | Setpoint (°C) |
| **HR10** | `G_Tune_Cmd` | `INT` | Gateway→PLC | 0=idle, 1=start tune |
| **HR11-12** | `G_PID_PB` | `REAL` | Gateway→PLC | Proportional Band (commanded) |
| **HR13-14** | `G_PID_Ti` | `REAL` | Gateway→PLC | Integral Time in seconds |
| **HR15-16** | `G_PID_Td` | `REAL` | Gateway→PLC | Derivative Time in seconds |
| **HR100** | `Last_Seq_Num` | `WORD` | PLC→Gateway | Ack sequence echo |
| **HR101** | `Heartbeat_Ctr` | `WORD` | PLC→Gateway | Comm heartbeat counter |
| **HR102-103** | `G_Current_MV` | `REAL` | PLC→Gateway | Active MV output (%) |
| **HR104** | `G_Tune_Done` | `WORD` | PLC→Gateway | 0/1 — AutoTune complete |
| **HR105-106** | `G_PID_PB_Out` | `REAL` | PLC→Gateway | Active / post-tune PB |
| **HR107-108** | `G_PID_Ti_Out` | `REAL` | PLC→Gateway | Active / post-tune Ti (s) |
| **HR109-110** | `G_PID_Td_Out` | `REAL` | PLC→Gateway | Active / post-tune Td (s) |

> **Key rule:** HR0..HR16 are **write registers** (gateway→PLC). HR100..HR110 are **read registers** (PLC→gateway). They are separate variables — no circular loop.

### 3c. Global Variables

```pascal
VAR_GLOBAL
    // ── Modbus transport ──────────────────────────────────
    G_Modbus_ReadBuf  : ARRAY[0..16]  OF WORD;    // HR0..HR16  incoming
    G_Modbus_WriteBuf : ARRAY[0..10]  OF WORD;    // HR100..HR110 outgoing

    // ── Web/Gateway commanded values (from Modbus HR) ─────
    G_RTD_Temp    : REAL;
    G_Web_Status  : INT;        // 0=off, 1=on
    G_Mode        : INT;        // C_MODE_*
    G_PLC_Status  : INT;        // 0=disabled, 1=enabled
    G_Manual_MV   : REAL;
    G_Setpoint    : REAL;
    G_Tune_Cmd    : INT;
    G_PID_PB      : REAL;       // PB from gateway "Send" click
    G_PID_Ti      : REAL;       // Ti (seconds) from gateway
    G_PID_Td      : REAL;       // Td (seconds) from gateway

    // ── Local HMI (NA5) commands ──────────────────────────
    // NA5 writes these directly via Sysmac variable mapping
    HMI_Mode          : INT;
    HMI_PLC_Enable    : BOOL;
    HMI_Setpoint      : REAL;
    HMI_Manual_MV     : REAL;
    HMI_TuneCmd       : BOOL;
    HMI_PID_PB        : REAL;   // typed in DataEdit, NOT applied until button
    HMI_PID_Ti        : REAL;
    HMI_PID_Td        : REAL;
    HMI_PID_Update    : BOOL;   // NA5 Apply/Confirm button
    HMI_PID_Update_Feedback : BOOL;  // PLC→NA5: flash confirmation

    // ── Arbitrated effective values (PrimaryTask → ControlTask) ──
    // ControlTask reads ONLY these — never G_* or HMI_* directly
    G_WebActive       : BOOL;
    G_CommAlive       : BOOL;
    G_Eff_Mode        : INT;    // C_MODE_*
    G_Eff_PLC_Enable  : BOOL;
    G_Eff_Setpoint    : REAL;
    G_Eff_Manual_MV   : REAL;
    G_Eff_TuneCmd     : BOOL;
    G_Eff_PID_PB      : REAL;   // latched PB (web on every scan / HMI on Apply)
    G_Eff_PID_Ti      : REAL;
    G_Eff_PID_Td      : REAL;

    // ── ControlTask outputs (read by PrimaryTask + CommTask) ─
    G_Current_MV      : REAL;   // active MV % — PrimaryTask clamps → PWM
    MV_percent        : REAL;   // raw MV from ControlTask (before clamp)
    G_PID_PB_Out      : REAL;   // active or post-tune PB (reported to gateway)
    G_PID_Ti_Out      : REAL;
    G_PID_Td_Out      : REAL;
    G_Tune_Done       : WORD;   // 0/1
    G_Tune_Busy       : WORD;
    G_Tune_Err        : WORD;

    // ── Safety ────────────────────────────────────────────
    G_OverheatLatched : BOOL;
END_VAR
```

---

## 4. Helper Functions (Structured Text)

### `FUN_WordsToReal`
Converts two Modbus 16-bit WORDs (Big Endian) to a REAL using `CopyDwordToReal`.

```pascal
FUNCTION FUN_WordsToReal : REAL
VAR_INPUT
    W_High : WORD;
    W_Low  : WORD;
END_VAR
VAR
    TempDWord : DWORD;
END_VAR

TempDWord := SHL(WORD_TO_DWORD(W_High), 16) OR WORD_TO_DWORD(W_Low);
FUN_WordsToReal := CopyDwordToReal(In := TempDWord);

END_FUNCTION
```

### `FB_RealToWords`
Converts a REAL to two 16-bit WORDs (Big Endian) for Modbus using `CopyRealToDword`.

```pascal
FUNCTION_BLOCK FB_RealToWords
VAR_INPUT
    InReal : REAL;
END_VAR
VAR_OUTPUT
    W_High : WORD;
    W_Low  : WORD;
END_VAR
VAR
    TempDWord : DWORD;
END_VAR

TempDWord := CopyRealToDword(In := InReal);
W_High := DWORD_TO_WORD(SHR(TempDWord, 16));
W_Low  := DWORD_TO_WORD(TempDWord AND 16#FFFF);

END_FUNCTION_BLOCK
```

---

## 5. CommTask Program — Modbus TCP Server Wrapper

**Task**: CommTask (100ms, lowest priority)
**Role**: Run `MB_Server` FB every scan; unpack incoming HR0..16 into `G_*` globals; pack `G_*_Out` into outgoing HR100..110.
**Does NOT**: compute EFF_*, arbitrate, run PID, or touch HMI_* variables.

### Program Variables

```pascal
PROGRAM PRG_CommTask
VAR
    MB_Server : MTCP_Server_NJNX;       // Omron MTCP_Server library FB

    StartServer          : BOOL := TRUE;
    Local_TcpPort        : UINT := UINT#1502;
    ConnectionTimeout    : TIME := T#0ms;       // 0 = no timeout
    Reset_SdRcvCounter   : BOOL := FALSE;

    Registers : ARRAY[0..200] OF WORD;          // HR0..HR200
    Coils     : ARRAY[0..255] OF BOOL;

    Server_Connected : BOOL;
    Server_Error     : BOOL;
    Server_ErrorID   : WORD;
    IP_Client        : STRING[15];
    Port_Client      : UINT;
    SdRcv_Counter    : UDINT;
    SdRcv_Last       : UDINT;

    Heartbeat_Ctr    : UINT;
    New_Seq          : WORD;
    Last_Seq_Num     : WORD;

    i : INT;

    // Real→Word converters (one instance per REAL value to send)
    R2W_MV : FB_RealToWords;
    R2W_PB : FB_RealToWords;
    R2W_Ti : FB_RealToWords;
    R2W_Td : FB_RealToWords;
END_VAR
```

### Structured Text Code

```pascal
(*
    PRG_CommTask
    - PLC is Modbus TCP SERVER (slave)
    - Gateway/Web is Modbus TCP CLIENT (master)
    - Runs in CommTask @ 100ms
*)

// =========================================================
// 1) Run the Modbus TCP Server FB EVERY scan
// =========================================================
MB_Server(
    Start              := StartServer,
    Local_TcpPort      := Local_TcpPort,
    ConnectionTimeout  := ConnectionTimeout,
    Reset_SdRcvCounter := Reset_SdRcvCounter,

    Registers          := Registers,
    Coils              := Coils,

    Connected          => Server_Connected,
    Error              => Server_Error,
    ErrorID            => Server_ErrorID,
    IP_Client          => IP_Client,
    Port_Client        => Port_Client,
    SdRcv_Counter      => SdRcv_Counter
);

// =========================================================
// 2) Heartbeat: increment on each completed Modbus transaction
//    PrimaryTask watchdog reads Heartbeat_Ctr to detect comm alive
// =========================================================
IF SdRcv_Counter <> SdRcv_Last THEN
    SdRcv_Last    := SdRcv_Counter;
    Heartbeat_Ctr := Heartbeat_Ctr + 1;
END_IF;

// =========================================================
// 3) Copy incoming gateway-written registers into read buffer
//    HR0..HR16 -> G_Modbus_ReadBuf[0..16]
// =========================================================
FOR i := 0 TO 16 DO
    G_Modbus_ReadBuf[i] := Registers[i];
END_FOR;

// =========================================================
// 4) Unpack read buffer into G_* globals
//    Only update on new sequence number (prevents stale re-apply)
// =========================================================
G_RTD_Temp := FUN_WordsToReal(G_Modbus_ReadBuf[1], G_Modbus_ReadBuf[2]);

New_Seq := G_Modbus_ReadBuf[0];

IF New_Seq <> Last_Seq_Num THEN
    G_Web_Status := WORD_TO_INT(G_Modbus_ReadBuf[3]);
    G_Mode       := WORD_TO_INT(G_Modbus_ReadBuf[4]);
    G_PLC_Status := WORD_TO_INT(G_Modbus_ReadBuf[5]);

    G_Manual_MV  := FUN_WordsToReal(G_Modbus_ReadBuf[6],  G_Modbus_ReadBuf[7]);
    G_Setpoint   := FUN_WordsToReal(G_Modbus_ReadBuf[8],  G_Modbus_ReadBuf[9]);

    G_Tune_Cmd   := WORD_TO_INT(G_Modbus_ReadBuf[10]);

    G_PID_PB     := FUN_WordsToReal(G_Modbus_ReadBuf[11], G_Modbus_ReadBuf[12]);
    G_PID_Ti     := FUN_WordsToReal(G_Modbus_ReadBuf[13], G_Modbus_ReadBuf[14]);
    G_PID_Td     := FUN_WordsToReal(G_Modbus_ReadBuf[15], G_Modbus_ReadBuf[16]);

    Last_Seq_Num := New_Seq;
END_IF;

// =========================================================
// 5) Pack G_*_Out into write buffer
//    G_PID_PB_Out etc. are written by ControlTask (active/post-tune values)
//    G_Current_MV is written by ControlTask
// =========================================================
G_Modbus_WriteBuf[0] := Last_Seq_Num;                   // HR100 ack seq
G_Modbus_WriteBuf[1] := UINT_TO_WORD(Heartbeat_Ctr);    // HR101 heartbeat

R2W_MV(InReal := G_Current_MV);
G_Modbus_WriteBuf[2] := R2W_MV.W_High;                  // HR102
G_Modbus_WriteBuf[3] := R2W_MV.W_Low;                   // HR103

G_Modbus_WriteBuf[4] := G_Tune_Done;                    // HR104

R2W_PB(InReal := G_PID_PB_Out);
G_Modbus_WriteBuf[5] := R2W_PB.W_High;                  // HR105
G_Modbus_WriteBuf[6] := R2W_PB.W_Low;                   // HR106

R2W_Ti(InReal := G_PID_Ti_Out);
G_Modbus_WriteBuf[7] := R2W_Ti.W_High;                  // HR107
G_Modbus_WriteBuf[8] := R2W_Ti.W_Low;                   // HR108

R2W_Td(InReal := G_PID_Td_Out);
G_Modbus_WriteBuf[9]  := R2W_Td.W_High;                 // HR109
G_Modbus_WriteBuf[10] := R2W_Td.W_Low;                  // HR110

// =========================================================
// 6) Copy write buffer into server registers
//    HR100..HR110 are gateway read-only (PLC→Gateway direction)
// =========================================================
FOR i := 0 TO 10 DO
    Registers[100 + i] := G_Modbus_WriteBuf[i];
END_FOR;

END_PROGRAM
```

---

## 6. `FB_ModbusServer` (MTCP_Server_NJNX) Source Code

See Omron MTCP_Server_NJNX v2.6 library. The full FB source is in the Omron library toolbox.  
Reference: https://www.myomron.com/index.php?action=kb&article=1245%2F1000

The FB handles: `SktTCPAccept`, `SktTCPRcv`, Modbus function codes 1,2,3,4,5,6,15,16,23, `SktTCPSend`, `SktClose`.

Port used: **1502** (non-privileged, no root needed on Linux gateway).
