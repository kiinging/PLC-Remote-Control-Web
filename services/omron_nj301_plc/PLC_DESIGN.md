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
Create this Data Type in Sysmac Studio.
```pascal
TYPE DUT_Modbus_Map :
STRUCT
    (* --- Read Block (Gateway -> PLC) --- *)
    R_RTD_Temp_H : WORD; (* HR0 *)
    R_RTD_Temp_L : WORD; (* HR1 *)
    R_Mode_Ack : WORD;   (* HR2 - PLC WRITES *)
    R_Mode : WORD;       (* HR3 *)
    R_Web_Ack : WORD;    (* HR4 - PLC WRITES *)
    R_Web_Status : WORD; (* HR5 *)
    R_PLC_Ack : WORD;    (* HR6 - PLC WRITES *)
    R_PLC_Status : WORD; (* HR7 *)
    
    (* Handshake: Manual MV *)
    R_ManMV_Flag : WORD; (* HR8 *)
    R_ManMV_Val_H : WORD; (* HR9 *)
    R_ManMV_Val_L : WORD; (* HR10 *)
    
    (* Handshake: PID *)
    R_PID_Flag : WORD;   (* HR11 *)
    R_PID_PB_H : WORD;   (* HR12 *)
    R_PID_PB_L : WORD;   (* HR13 *)
    R_PID_Ti_H : WORD;   (* HR14 *)
    R_PID_Ti_L : WORD;   (* HR15 *)
    R_PID_Td_H : WORD;   (* HR16 *)
    R_PID_Td_L : WORD;   (* HR17 *)
    
    (* Handshake: Setpoint *)
    R_SP_Flag : WORD;    (* HR18 *)
    R_SP_Val_H : WORD;   (* HR19 *)
    R_SP_Val_L : WORD;   (* HR20 *)
    
    (* Return Values (PLC Write) *)
    R_MV_Ret_H : WORD;   (* HR21 *)
    R_MV_Ret_L : WORD;   (* HR22 *)
    
    (* Tune Handshakes *)
    R_Tune_Start_Ack : WORD; (* HR23 - PLC WRITES *)
    R_Tune_Start : WORD;     (* HR24 *)
    R_Tune_Stop_Ack : WORD;  (* HR25 - PLC WRITES *)
    R_Tune_Stop : WORD;      (* HR26 *)
    R_Tune_Done : WORD;      (* HR27 - PLC WRITES *)
    
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
| `Trigger_Write` | BOOL | Flag to trigger Fn10 |
| `Connect_Req` | BOOL | Request to Connect (Default TRUE) |
| `Is_Connected` | BOOL | Output from Connect FB |
| **FB_Connect** | `MTCP_Client_Connect` | Instance for Connection |
| **FB_Read_Fn03** | `MTCP_Client_Fn03` | Instance for Read Holding Regs |
| **FB_Write_Fn10** | `MTCP_Client_Fn10` | Instance for Write Multiple Regs |
| `Socket_Data` | `_sSOCKET` (or similar) | Socket Handle (Passed between FBs) |
| `Error_Flag` | BOOL | General Error Flag |
| `Error_ID` | WORD | Error Code |

### Structured Text Code
```pascal
(* ============================================= *)
(*           COMM TASK - MAIN LOOP               *)
(* ============================================= *)

(* --- 1. Manage TCP Connection (Always Active) --- *)
FB_Connect(
    Enable := TRUE, 
    IPaddress := '192.168.8.134',   (* Gateway IP from config *)
    Port := 1502,                   (* Modbus Port *)
    Connect := Connect_Req,         (* Set to TRUE in Init *)
    Connected => Is_Connected,
    Error => Error_Flag,
    ErrorID => Error_ID,
    TCP_Socket => Socket_Data       (* Handle passed to other FBs *)
);

(* Reset State if Connection Lost *)
IF NOT Is_Connected THEN
    State := 0; 
END_IF;

(* ============================================= *)
(*              STATE MACHINE                    *)
(* ============================================= *)
CASE State OF

    0: (* INIT: Trigger Connection *)
        Connect_Req := TRUE;
        IF Is_Connected THEN
            State := 10; (* Ready -> Start Read *)
        END_IF;

    (* ------------------------------------------------------------- *)
    (* STEP 10: READ HOLDING REGISTERS (Fn03) - Read HR0-27          *)
    (* ------------------------------------------------------------- *)
    10: 
        Trigger_Read := TRUE;
        
        FB_Read_Fn03(
            Enable := TRUE,
            TCP_Socket := Socket_Data,
            Unit_ID := 1,
            Register_Address := 0,     (* Start at HR0 *)
            Register_Qty := 28,        (* Read 28 Words *)
            Send_Request := Trigger_Read,
            Register => G_Modbus_ReadBuf, (* Dump to Read Buffer *)
            Cmd_Ok => Cmd_Read_Ok,
            Error => Cmd_Read_Err
        );
        
        IF Cmd_Read_Ok THEN
             Trigger_Read := FALSE;    (* Reset Trigger *)
             State := 20;              (* Success -> Process *)
        ELSIF Cmd_Read_Err THEN
             Trigger_Read := FALSE;
             State := 90;              (* Error recovery *)
        END_IF;


    (* ------------------------------------------------------------- *)
    (* STEP 20: PROCESS DATA (Logic & Mapping)                       *)
    (* ------------------------------------------------------------- *)
    20: 
        (* Safety Copy: ReadBuf -> WriteBuf (Applies "Copy-Through" for Unchanged Regs) *)
        FOR i:=0 TO 27 DO
            G_Modbus_WriteBuf[i] := G_Modbus_ReadBuf[i];
        END_FOR;

        (* === EVENT HANDSHAKES (Values) === *)
        
        (* 1. Manual MV (Flag: HR8, Data: HR9-10) *)
        IF (G_Modbus_ReadBuf[8] = 1) THEN
             G_Manual_MV := FUN_WordsToReal(G_Modbus_ReadBuf[9], G_Modbus_ReadBuf[10]);
             G_Modbus_WriteBuf[8] := 0; (* Ack *)
        ELSE
             G_Modbus_WriteBuf[8] := 0; (* Always Clear ACK if no new request *)
        END_IF;

        (* 2. PID Params (Flag: HR11, Data: HR12-17) *)
        IF (G_Modbus_ReadBuf[11] = 1) THEN
             G_PID_PB := FUN_WordsToReal(G_Modbus_ReadBuf[12], G_Modbus_ReadBuf[13]);
             G_PID_Ti := FUN_WordsToReal(G_Modbus_ReadBuf[14], G_Modbus_ReadBuf[15]);
             G_PID_Td := FUN_WordsToReal(G_Modbus_ReadBuf[16], G_Modbus_ReadBuf[17]);
             G_Modbus_WriteBuf[11] := 0; 
        ELSE
             G_Modbus_WriteBuf[11] := 0;
        END_IF;

        (* 3. Setpoint (Flag: HR18, Data: HR19-20) *)
        IF (G_Modbus_ReadBuf[18] = 1) THEN
             G_Setpoint := FUN_WordsToReal(G_Modbus_ReadBuf[19], G_Modbus_ReadBuf[20]);
             G_Modbus_WriteBuf[18] := 0;
        ELSE
             G_Modbus_WriteBuf[18] := 0;
        END_IF;

        (* === STATE MIRRORING (Status) === *)
        
        G_Modbus_WriteBuf[2] := G_Modbus_ReadBuf[3]; (* Mode Ack *)
        G_Modbus_WriteBuf[4] := G_Modbus_ReadBuf[5]; (* Web Status Ack *)
        G_Modbus_WriteBuf[6] := G_Modbus_ReadBuf[7]; (* PLC Status Ack *)
        G_Modbus_WriteBuf[23] := G_Modbus_ReadBuf[24]; (* Tune Start Ack *)
        G_Modbus_WriteBuf[25] := G_Modbus_ReadBuf[26]; (* Tune Stop Ack *)
        
        (* === UPDATE REAL-TIME VALUES === *)
        (* Convert Current MV to Modbus Words (HR21-22) *)
        FUN_RealToWords(G_Current_MV, G_Modbus_WriteBuf[21], G_Modbus_WriteBuf[22]);

        State := 30; (* Go to Write *)


    (* ------------------------------------------------------------- *)
    (* STEP 30: WRITE HOLDING REGISTERS (Fn10) - Write HR0-27        *)
    (* ------------------------------------------------------------- *)
    30:
        Trigger_Write := TRUE;
        
        FB_Write_Fn10(
            Enable := TRUE,
            TCP_Socket := Socket_Data,
            Unit_ID := 1,
            Register_Address := 0,     (* Write HR0 *)
            Register_Qty := 28,        (* Write 28 Words *)
            Registers := G_Modbus_WriteBuf, (* Source Data *)
            Send_Request := Trigger_Write,
            Cmd_Ok => Cmd_Write_Ok,
            Error => Cmd_Write_Err
        );
        
        IF Cmd_Write_Ok THEN
            Trigger_Write := FALSE;
            State := 10;               (* Success -> Loop back to Read *)
        ELSIF Cmd_Write_Err THEN
            Trigger_Write := FALSE;
            State := 90;
        END_IF;


    (* ------------------------------------------------------------- *)
    (* ERROR HANDLING                                                *)
    (* ------------------------------------------------------------- *)
    90: 
        (* Simple recovery: wait a bit or just reset to Init to reconnect *)
        Trigger_Read := FALSE;
        Trigger_Write := FALSE;
        State := 0; 
        
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
