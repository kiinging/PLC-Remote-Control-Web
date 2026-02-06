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
| Name | Type | Initial | Comment |
| :--- | :--- | :--- | :--- |
| `G_Modbus_ReadBuf` | `ARRAY[0..29] OF WORD` | - | Raw Read Data |
| `G_Modbus_WriteBuf` | `ARRAY[0..29] OF WORD` | - | Raw Write Data |
| `G_RTD_Temp` | `REAL` | 0.0 | Extracted Process Value |
| `G_Web_Status` | `INT` | 0 | from Gateway |
| `G_Mode` | `INT` | 0 | from Gateway |
| `G_PLC_Status` | `INT` | 0 | from Gateway |
| `G_Manual_MV` | `REAL` | 0.0 | from Gateway |
| `G_Setpoint` | `REAL` | 0.0 | from Gateway |
| `G_Tune_Cmd` | `INT` | 0 | from Gateway |
| `G_PID_PB` | `REAL` | 0.0 | from Gateway |
| `G_PID_Ti` | `REAL` | 0.0 | from Gateway |
| `G_PID_Td` | `REAL` | 0.0 | from Gateway |
| `G_Current_MV` | `REAL` | 0.0 | Feedback to Gateway |
| `G_Tune_Done` | `INT` | 0 | Feedback to Gateway |
| `G_PID_PB_Out` | `REAL` | 0.0 | Feedback to Gateway |
| `G_PID_Ti_Out` | `REAL` | 0.0 | Feedback to Gateway |
| `G_PID_Td_Out` | `REAL` | 0.0 | Feedback to Gateway |

---

## 4. Helper Functions (Structured Text)

### `FUN_WordsToReal`
Converts two Modbus 16-bit WORDs (Big Endian) to a REAL (Float) using `CopyDwordToReal`.
*Input*: `W_High` (WORD), `W_Low` (WORD)
*Return*: `REAL`

```pascal
(* Sysmac Studio ST *)
FUNCTION FUN_WordsToReal : REAL
VAR_INPUT
    W_High : WORD;
    W_Low  : WORD;
END_VAR
VAR
    TempDWord : DWORD;
END_VAR

(* Combine High and Low words into a DWORD *)
(* Big Endian: High Word shifted left *)
TempDWord := SHL(WORD_TO_DWORD(W_High), 16) OR WORD_TO_DWORD(W_Low);

(* Bit-wise cast to REAL *)
FUN_WordsToReal := CopyDwordToReal(In := TempDWord);

END_FUNCTION
```

### `FB_RealToWords`
Converts a REAL to two 16-bit WORDs (Big Endian) for Modbus using `CopyRealToDword`.
*Input*: `InReal` (REAL)
*Output*: `W_High` (WORD), `W_Low` (WORD)

```pascal
(* Sysmac Studio ST *)
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

(* Copy IEEE754 bits of REAL into DWORD *)
TempDWord := CopyRealToDword(In := InReal);

(* Split into High/Low WORD (Big Endian: High first) *)
W_High := DWORD_TO_WORD(SHR(TempDWord, 16));
W_Low  := DWORD_TO_WORD(TempDWord AND 16#FFFF);

END_FUNCTION_BLOCK
```

---

## 5. CommTask Program (Single Program)

This program runs every **60ms** (or as configured). It manages the TCP connection and the Read-Process-Write cycle using `MTCP` Function Blocks.

> [!NOTE]
> This implementation uses **Function 16 (Write Multiple Registers)** for Block 2 (HR100-110). This is significantly more efficient than writing registers one by one using Function 06.

### Variables
| Name | Type | Initial | Comment |
| :--- | :--- | :--- | :--- |
| `State` | INT | 0 | State Machine Step |
| `Trigger_Read` | BOOL | FALSE | Flag to trigger Fn03 |
| `Trigger_Write` | BOOL | FALSE | Flag to trigger Fn06 |
| `Connect_Req` | BOOL | FALSE | Request to Connect |
| `Is_Connected` | BOOL | FALSE | Output from Connect FB |
| `Error_Flag` | BOOL | FALSE | General Error Flag |
| `Error_ID` | WORD | 0 | Error Code |
| `TCP_Socket` | `_sSOCKET` | - | Socket Handle |
| **FB_Connect** | `MTCP_Client_Connect` | - | Instance for Connection |
| **FB_Read_Fn03** | `MTCP_Client_Fn03` | - | Instance for Read Holding Regs |
| **FB_Write_Fn06** | `MTCP_Client_Fn06` | - | Instance for Write Single Reg |
| `UnitID` | BYTE | 16#01 | Modbus Unit ID |
| `Cmd_Read_Ok` | BOOL | FALSE | Read Success Flag |
| `Cmd_Read_Err` | BOOL | FALSE | Read Error Flag |
| `Cmd_Write_Ok` | BOOL | FALSE | Write Success Flag |
| `Cmd_Write_Err` | BOOL | FALSE | Write Error Flag |
| `T_1s` | `TON` | - | Timer for 1s Throttling |
| `Last_Seq_Num` | WORD | 16#FFFF | Handshake: Last seen Sequence |
| `New_Seq` | WORD | 0 | Temp sequence holder |
| `Heartbeat_Ctr` | WORD | 0 | Handshake: Heartbeat Counter |
| `WriteIndex` | INT | 0 | Write Loop Index (0..10) |
| `WriteQty` | INT | 11 | Write Loop Qty (regs) |
| `WriteRegAddr` | UINT | 0 | Current Write Address |
| `WriteValue` | WORD | 0 | Current Write Value |
| **R2W_MV** | `FB_RealToWords` | - | Helper Instance |
| **R2W_PB** | `FB_RealToWords` | - | Helper Instance |
| **R2W_Ti** | `FB_RealToWords` | - | Helper Instance |
| **R2W_Td** | `FB_RealToWords` | - | Helper Instance |

### Structured Text Code
(* ========================================================= *)
(*                 CONNECTION MANAGER                         *)
(* ========================================================= *)

FB_Connect(
    Enable     := TRUE,
    IPaddress  := '192.168.0.134',
    Port       := 1502,
    Connect    := TRUE,
    Connected  => Is_Connected,
    Error      => Error_Flag,
    ErrorID    => Error_ID,
    TCP_Socket => TCP_Socket
);


(* ========================================================= *)
(*                    STATE MACHINE                           *)
(* ========================================================= *)

CASE State OF

    0:  (* WAIT CONNECTED + 1s THROTTLE *)
        IF Is_Connected THEN
            T_1s(IN := TRUE, PT := T#1s);
            IF T_1s.Q THEN
                T_1s(IN := FALSE);   (* reset timer *)
                State := 10;
            END_IF;
        ELSE
            T_1s(IN := FALSE);
        END_IF;

    10: (* ARM READ *)
        Trigger_Read := TRUE;
        State := 11;

    11: (* Fn03 READ HR0..HR16 (17 words) *)
        FB_Read_Fn03(
            Enable            := TRUE,
            TCP_Socket        := TCP_Socket,
            Unit_ID           := UnitID,
            Register_Address  := 0,
            Register_Qty      := UINT#17,
            Send_Request      := Trigger_Read,
            Register          => G_Modbus_ReadBuf,  (* adjust name if your FB uses "Registers" *)
            Cmd_Ok            => Cmd_Read_Ok,
            Error             => Cmd_Read_Err
        );

        IF Cmd_Read_Ok OR Cmd_Read_Err THEN
            Trigger_Read := FALSE;  (* IMPORTANT: must drop low *)
            IF Cmd_Read_Err THEN
                State := 90;
            ELSE
                State := 20;
            END_IF;
        END_IF;

    20: (* PROCESS READ DATA *)
        (* Always update telemetry *)
        G_RDT_Temp := FUN_WordsToReal(G_Modbus_ReadBuf[1], G_Modbus_ReadBuf[2]);

        (* Sequence check for commands *)
        New_Seq := G_Modbus_ReadBuf[0];

        IF (New_Seq <> Last_Seq_Num) THEN
            (* Copy commands/params *)
            G_WebStatus := WORD_TO_INT(G_Modbus_ReadBuf[3]);
            G_Mode       := WORD_TO_INT(G_Modbus_ReadBuf[4]);
            G_PLC_Status := WORD_TO_INT(G_Modbus_ReadBuf[5]);

            G_Manual_MV  := FUN_WordsToReal(G_Modbus_ReadBuf[6], G_Modbus_ReadBuf[7]);
            G_Setpoint   := FUN_WordsToReal(G_Modbus_ReadBuf[8], G_Modbus_ReadBuf[9]);

            G_Tune_Cmd   := WORD_TO_INT(G_Modbus_ReadBuf[10]);

            G_PID_PB     := FUN_WordsToReal(G_Modbus_ReadBuf[11], G_Modbus_ReadBuf[12]);
            G_PID_Ti     := FUN_WordsToReal(G_Modbus_ReadBuf[13], G_Modbus_ReadBuf[14]);
            G_PID_Td     := FUN_WordsToReal(G_Modbus_ReadBuf[15], G_Modbus_ReadBuf[16]);

            Last_Seq_Num := New_Seq;
        END_IF;

        State := 30;

    30: (* PREPARE WRITE BUFFER HR100..HR110 *)
        (* HR100: Ack seq *)
        G_Modbus_WriteBuf[0] := Last_Seq_Num;

        (* HR101: Heartbeat *)
        Heartbeat_Ctr := Heartbeat_Ctr + 1;
        G_Modbus_WriteBuf[1] := UINT_TO_WORD(Heartbeat_Ctr);

        (* HR102-103: MV feedback *)
        R2W_MV(InReal := G_Current_MV);
        G_Modbus_WriteBuf[2] := R2W_MV.W_High;
        G_Modbus_WriteBuf[3] := R2W_MV.W_Low;

        (* HR104: Tune done flag *)
        G_Modbus_WriteBuf[4] := INT_TO_WORD(G_Tune_Done);

        (* HR105-110: Tuned PID outputs (write 0s if not used) *)
        R2W_PB(InReal := G_PID_PB_Out);
        G_Modbus_WriteBuf[5] := R2W_PB.W_High;
        G_Modbus_WriteBuf[6] := R2W_PB.W_Low;

        R2W_Ti(InReal := G_PID_Ti_Out);
        G_Modbus_WriteBuf[7] := R2W_Ti.W_High;
        G_Modbus_WriteBuf[8] := R2W_Ti.W_Low;

        R2W_Td(InReal := G_PID_Td_Out);
        G_Modbus_WriteBuf[9]  := R2W_Td.W_High;
        G_Modbus_WriteBuf[10] := R2W_Td.W_Low;

        (* Start write loop *)
        WriteIndex := 0;
        State := 40;

    40: (* ARM WRITE OF ONE REGISTER *)
        WriteRegAddr := UINT#100 + INT_TO_UINT(WriteIndex);
        WriteValue   := G_Modbus_WriteBuf[WriteIndex];
        Trigger_Write := TRUE;
        State := 41;

    41: (* Fn06 WRITE SINGLE REGISTER *)
        FB_Write_Fn06(
            Enable            := TRUE,
            TCP_Socket        := TCP_Socket,
            Unit_ID           := UnitID,
            Register_Address  := 0,
            Set_Value         := WriteValue,
            Send_Request      := Trigger_Write,
            Cmd_Ok            => Cmd_Write_Ok,
            Error             => Cmd_Write_Err
        );

        IF Cmd_Write_Ok OR Cmd_Write_Err THEN
            Trigger_Write := FALSE;   (* IMPORTANT: must drop low *)

            IF Cmd_Write_Err THEN
                State := 90;
            ELSE
                WriteIndex := WriteIndex + 1;
                IF WriteIndex >= WriteQty THEN
                    State := 0;       (* done; next cycle after 1s throttle *)
                ELSE
                    State := 40;      (* write next register *)
                END_IF;
            END_IF;
        END_IF;

    90: (* ERROR RECOVERY *)
        Trigger_Read := FALSE;
        Trigger_Write := FALSE;
        State := 0;

END_CASE;





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
