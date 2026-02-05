# Omron NJ310 PLC Design Document

## 1. System Architecture
-   **Gateway**: Modbus TCP Server (Slave)
-   **PLC**: Modbus TCP Client (Master)
-   **IP/Port**: configured in `config.py` (Default 502)

## 2. Task Allocation
| Task Name | Priority | Interval | Purpose |
| :--- | :--- | :--- | :--- |
| **PrimaryTask** | 4 | 4ms | Critical I/O, Safety, Fast Logic |
| **ControlTask** | 16 | 20ms | PID Loops, Scaling, Analog IO |
| **CommTask** | 17 | 60ms | Modbus TCP Client (Handshake & Data Exchange) |

---

## 3. Data Types & Globals

### Structure: `DUT_Modbus_Map`
Create this Data Type in Sysmac Studio. This helps valid variable mapping if you overlay it, but the ST below uses raw arrays.

```pascal
TYPE DUT_Modbus_Map :
STRUCT
    (* --- Block 1: Read (GW -> PLC) [HR0 - HR16] --- *)
    R_Seq_Num : WORD;    (* HR0: Sequence Number *)
    R_RTD_H : WORD;      (* HR1 *)
    R_RTD_L : WORD;      (* HR2 *)
    R_Web_Status : WORD; (* HR3 *)
    R_Mode : WORD;       (* HR4 *)
    R_PLC_Status : WORD; (* HR5 *)
    R_ManMV_H : WORD;    (* HR6 *)
    R_ManMV_L : WORD;    (* HR7 *)
    R_SP_H : WORD;       (* HR8 *)
    R_SP_L : WORD;       (* HR9 *)
    R_Tune_Cmd : WORD;   (* HR10 *)
    R_PID_PB_H : WORD;   (* HR11 *)
    R_PID_PB_L : WORD;   (* HR12 *)
    R_PID_Ti_H : WORD;   (* HR13 *)
    R_PID_Ti_L : WORD;   (* HR14 *)
    R_PID_Td_H : WORD;   (* HR15 *)
    R_PID_Td_L : WORD;   (* HR16 *)

    (* --- Block 2: Write (PLC -> GW) [HR100 - HR110] --- *)
    W_Ack_Seq : WORD;    (* HR100 *)
    W_Heartbeat : WORD;  (* HR101 *)
    W_MV_Ret_H : WORD;   (* HR102 *)
    W_MV_Ret_L : WORD;   (* HR103 *)
    W_Tune_Done : WORD;  (* HR104 *)
    W_PID_Out_PB_H : WORD; (* HR105 *)
    W_PID_Out_PB_L : WORD; (* HR106 *)
    W_PID_Out_Ti_H : WORD; (* HR107 *)
    W_PID_Out_Ti_L : WORD; (* HR108 *)
    W_PID_Out_Td_H : WORD; (* HR109 *)
    W_PID_Out_Td_L : WORD; (* HR110 *)
    
END_STRUCT
END_TYPE
```

### Global Variables
| Name | Type | Comment |
| :--- | :--- | :--- |
| `G_Modbus_ReadBuf` | `ARRAY[0..29] OF WORD` | Raw Read Data |
| `G_Modbus_WriteBuf` | `ARRAY[0..29] OF WORD` | Raw Write Data (Mirror of Gateway HRs) |
| `G_Connection_Handle` | `Socket` (Conceptually) | Handled by Function Block |
| `G_Manual_MV` | `REAL` | Extracted Manual MV |

---

## 4. Helper Functions (Structured Text)

### `FUN_WordsToReal`
Converts two Modbus 16-bit WORDs (Big Endian) to a REAL (Float).
*Input*: `W_High` (WORD), `W_Low` (WORD)
*Return*: `REAL`

```pascal
(* Sysmac Studio ST *)
FUNCTION FUN_WordsToReal : REAL
VAR_INPUT
    W_High : WORD;
    W_Low : WORD;
END_VAR
VAR
    TempDWord : DWORD;
    RealPtr : POINTER TO REAL;
END_VAR

(* Combine High and Low words into a DWORD *)
(* Assuming Big Endian Transmission: High Word comes first *)
(* Method: Shift High Word left 16 bits, OR with Low Word *)
TempDWord := SHL(WORD_TO_DWORD(W_High), 16) OR WORD_TO_DWORD(W_Low);

(* Convert bit-wise to REAL (Re-interpret cast) *)
(* In Omron NJ, use the Bit conversion functions if available, or Pointers *)
(* Safest generic way: *)
FUN_WordsToReal := DWORD_TO_REAL_BIT(TempDWord); 

(* Note: If Endianness is wrong, swap W_High and W_Low inputs *)
END_FUNCTION
```

### `FUN_RealToWords`
Converts a REAL to two 16-bit WORDs (Big Endian) for Modbus.
*Input*: `InReal` (REAL)
*Output*: `W_High` (WORD), `W_Low` (WORD)

```pascal
(* Sysmac Studio ST *)
FUNCTION_BLOCK FUN_RealToWords
VAR_INPUT
    InReal : REAL;
END_VAR
VAR_OUTPUT
    W_High : WORD;
    W_Low : WORD;
END_VAR
VAR
    TempDWord : DWORD;
END_VAR

(* Get bits of valid REAL *)
TempDWord := REAL_TO_DWORD_BIT(InReal);

(* Extract High Word (Upper 16 bits) *)
W_High := DWORD_TO_WORD(SHR(TempDWord, 16));

(* Extract Low Word (Lower 16 bits) *)
W_Low := DWORD_TO_WORD(TempDWord AND 16#FFFF);
END_FUNCTION_BLOCK
```

---

## 5. CommTask Program (Single Program)

This program runs every **60ms**. It manages the TCP connection and the Read-Process-Write cycle using the specific `MTCP` Function Blocks.

### Variables
| Name | Type | Comment |
| :--- | :--- | :--- |
| `State` | INT | State Machine Step |
| `Trigger_Read` | BOOL | Flag to trigger Fn03 |
| `Trigger_Write` | BOOL | Flag to trigger Fn16 |
| `Connect_Req` | BOOL | Request to Connect (Default TRUE) |
| `Is_Connected` | BOOL | Output from Connect FB |
| **FB_Connect** | `MTCP_Client_Connect` | Instance for Connection |
| **FB_Read_Fn03** | `MTCP_Client_Fn03` | Instance for Read Holding Regs |
| **FB_Write_Fn16** | `MTCP_Client_Fn16` | Instance for Write Multiple Regs |
| `Socket_Data` | `_sSOCKET` | Socket Handle |
| `Last_Seq_Num` | WORD | Internal State: Last seen Sequence |
| `Heartbeat_Ctr` | WORD | Internal State: Heartbeat Counter |

### Structured Text Code
```pascal
(* ============================================= *)
(*        COMM TASK - CONNECTION MANAGER         *)
(* ============================================= *)

(* One-shot connect request *)
IF (NOT Is_Connected) AND (NOT Connect_Req) THEN
    Connect_Req := TRUE;          (* request connect *)
ELSIF Is_Connected THEN
    Connect_Req := FALSE;         (* clear once connected *)
END_IF;

(* Call connect FB every scan *)
FB_Connect(
    Enable := TRUE,
    IPaddress := '192.168.0.134',
    Port := 1502,
    Connect := Connect_Req,
    Connected => Is_Connected,
    Error => Error_Flag,
    ErrorID => Error_ID,
    TCP_Socket => TCP_Socket
);

(* If connection drops, reset comm state machine *)
IF NOT Is_Connected THEN
    Trigger_Read := FALSE;
    Trigger_Write := FALSE;
    State := 0;                  (* Go back to Wait *)
END_IF;

(* ============================================= *)
(*              INTERVAL CONTROL                 *)
(* ============================================= *)
(* Generate 1s Pulse: Requires 'R_TRIG_Inst' variable of type R_TRIG *)
(* Or use Timer. Here we assume this task runs every 60ms and cycles as fast as possible *)
(* But for Modbus, maybe throttle to 100ms or just run freely *)
(* Let's just run the state machine freely once connected. *)

(* ============================================= *)
(*              STATE MACHINE                    *)
(* ============================================= *)
CASE State OF

    0:  (* WAIT CONNECTED *)
        IF Is_Connected THEN
            State := 10;
        END_IF;

    10: (* ARM READ TRIGGER *)
        Trigger_Read := TRUE;
        State := 11;

    11: (* Fn03 READ Block 1 (HR0-16) -> Size 17 *)
        FB_Read_Fn03(
            Enable := TRUE,
            TCP_Socket := TCP_Socket,
            Unit_ID := 16#1,
            Register_Address := 0,      (* Start at HR0 *)
            Register_Qty := 17,         (* Read 17 Words *)
            Send_Request := Trigger_Read,
            Register => G_Modbus_ReadBuf,
            Cmd_Ok => Cmd_Read_Ok,
            Error => Cmd_Read_Err
        );

        IF Cmd_Read_Ok OR Cmd_Read_Err THEN
            Trigger_Read := FALSE;   (* REQUIRED: drop low so FB can re-arm *)
            State := 20;
        END_IF;

    20: (* PROCESS READ DATA *)
        IF Cmd_Read_Err THEN
            State := 90;             (* go recover *)
        ELSE
            (* --- 1. ALWAYS Update Telemetry (RTD) --- *)
            (* HR1-2: RTD *)
            G_RTD_Temp := FUN_WordsToReal(G_Modbus_ReadBuf[1], G_Modbus_ReadBuf[2]);

            (* --- 2. Check Sequence for Commands --- *)
            (* HR0: Sequence Number *)
            New_Seq := G_Modbus_ReadBuf[0];
            
            IF (New_Seq <> Last_Seq_Num) THEN
                (* Sequence Changed! Update Command Variables *)
                
                G_Web_Status := WORD_TO_INT(G_Modbus_ReadBuf[3]);
                G_Mode       := WORD_TO_INT(G_Modbus_ReadBuf[4]);
                G_PLC_Status := WORD_TO_INT(G_Modbus_ReadBuf[5]);
                
                G_Manual_MV  := FUN_WordsToReal(G_Modbus_ReadBuf[6], G_Modbus_ReadBuf[7]);
                G_Setpoint   := FUN_WordsToReal(G_Modbus_ReadBuf[8], G_Modbus_ReadBuf[9]);
                
                G_Tune_Cmd   := WORD_TO_INT(G_Modbus_ReadBuf[10]);
                
                G_PID_PB     := FUN_WordsToReal(G_Modbus_ReadBuf[11], G_Modbus_ReadBuf[12]);
                G_PID_Ti     := FUN_WordsToReal(G_Modbus_ReadBuf[13], G_Modbus_ReadBuf[14]);
                G_PID_Td     := FUN_WordsToReal(G_Modbus_ReadBuf[15], G_Modbus_ReadBuf[16]);
                
                (* Update Local 'Last Sequence' to match *)
                Last_Seq_Num := New_Seq;
            END_IF;

            State := 30;
        END_IF;

    30: (* PREPARE WRITE DATA *)
        (* Map internal variables to G_Modbus_WriteBuf (Size 11) *)
        
        (* HR100: Ack Sequence (Mirror the Last Seen Sequence) *)
        G_Modbus_WriteBuf[0] := Last_Seq_Num;
        
        (* HR101: Heartbeat (Increment every cycle or 1s) *)
        (* Here, incrementing every message cycle is fine, or restrict to 1s *)
        Heartbeat_Ctr := Heartbeat_Ctr + 1;
        G_Modbus_WriteBuf[1] := Heartbeat_Ctr;
        
        (* HR102-103: MV Return *)
        FUN_RealToWords(G_Current_MV, G_Modbus_WriteBuf[2], G_Modbus_WriteBuf[3]);
        
        (* HR104: Tune Done Flag *)
        G_Modbus_WriteBuf[4] := INT_TO_WORD(G_Tune_Done);
        
        (* HR105-110: Tuned PID Out *)
        FUN_RealToWords(G_PID_PB_Out, G_Modbus_WriteBuf[5], G_Modbus_WriteBuf[6]);
        FUN_RealToWords(G_PID_Ti_Out, G_Modbus_WriteBuf[7], G_Modbus_WriteBuf[8]);
        FUN_RealToWords(G_PID_Td_Out, G_Modbus_WriteBuf[9], G_Modbus_WriteBuf[10]);

        State := 40;

    40: (* ARM WRITE TRIGGER *)
        Trigger_Write := TRUE;
        State := 41;

    41: (* Fn16 WRITE Block 2 (HR100-110) -> Address 100, Qty 11 *)
        FB_Write_Fn16(
            Enable := TRUE,
            TCP_Socket := TCP_Socket,
            Unit_ID := 16#1,
            Register_Address := 100,    (* Start at HR100 *)
            Register_Qty := 11,         (* Write 11 Words *)
            Registers := G_Modbus_WriteBuf,
            Send_Request := Trigger_Write,
            Cmd_Ok => Cmd_Write_Ok,
            Error => Cmd_Write_Err
        );

        IF Cmd_Write_Ok OR Cmd_Write_Err THEN
            Trigger_Write := FALSE;  (* REQUIRED: drop low so FB can re-arm *)
            
            IF Cmd_Write_Err THEN
                State := 90;
            ELSE
                State := 0;         (* SUCCESS: Loop back to 0 *)
            END_IF;
        END_IF;

    90: (* ERROR RECOVERY *)
        Trigger_Read := FALSE;
        Trigger_Write := FALSE;
        State := 0; (* Reset to Wait *)

END_CASE;
```

---
## 6. ControlTask Integration
Simply use the global variable `G_Manual_MV`.
```pascal
(* ControlTask ST *)

(* Scale Inputs ... *)

(* PID Call ... *)

(* Mode Selection *)
IF G_Mode = MODE_MANUAL THEN
    (* User Manual MV from Modbus *)
    Final_Output := G_Manual_MV; 
ELSE
    (* PID Output *)
    Final_Output := PID_Out;
END_IF;

(* Write to Analog Output ... *)
```
