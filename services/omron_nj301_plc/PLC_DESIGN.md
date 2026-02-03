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

## 5. CommTask State Machine (Detailed)

This tasks runs every 60ms. It handles the "Read -> Process -> Write" cycle.

**Two Types of Handshake Logic:**
1.  **Event Handshake (Values)**: Gateway sets Flag=1 -> PLC reads Value -> PLC sets Flag=0.
2.  **State Mirroring (Status)**: Gateway sets Status (0/1) -> PLC mirrors Status to Ack (0/1).

**Variables in Task**:
-   `State` (INT)
-   `FB_Read` (ModbusReadFunctionBlock), `FB_Write` (ModbusWriteFunctionBlock)
-   `Trigger_Ack_ManMV` (BOOL), `Trigger_Ack_PID` (BOOL), etc.

**Code**:
```pascal
(* State Machine *)
CASE State OF
    0: (* Init *)
        State := 10;
        
    10: (* READ REQUEST: Read HR0-27 *)
        FB_Read.Execute := TRUE;
        (* Optional: Check/Set Count=28 in FB params if not hardcoded *)
        State := 11;
        
    11: (* WAIT FOR READ *)
        FB_Read();
        if FB_Read.Done THEN
            FB_Read(Execute:=FALSE); (* Reset *)
            State := 20; (* Success -> Process *)
        ELSIF FB_Read.Error THEN
            FB_Read(Execute:=FALSE);
            State := 90; (* Error *)
        END_IF;

    20: (* ---------------- PROCESS DATA ---------------- *)
    
        (* === STEP 1: PRESERVE GATEWAY DATA (Safety Copy) === *)
        (* Copy ReadBuf to WriteBuf so we don't overwrite GW values (e.g. RTD) with 0s *)
        (* This effectively implements a 'Read-Modify-Write' pattern *)
        FOR i:=0 TO 27 DO
            G_Modbus_WriteBuf[i] := G_Modbus_ReadBuf[i];
        END_FOR;

        (* === TYPE 1: EVENT HANDSHAKE (Values) === *)
        
        (* 1. Manual MV (Flag: HR8, Data: HR9-10) *)
        IF (G_Modbus_ReadBuf[8] = 1) THEN
             G_Manual_MV := FUN_WordsToReal(G_Modbus_ReadBuf[9], G_Modbus_ReadBuf[10]);
             G_Modbus_WriteBuf[8] := 0; (* Ack *)
        ELSE
             G_Modbus_WriteBuf[8] := 0; 
        END_IF;
        
        (* 2. PID Params (Flag: HR11, Data: HR12-17) *)
        IF (G_Modbus_ReadBuf[11] = 1) THEN
             G_PID_PB := FUN_WordsToReal(G_Modbus_ReadBuf[12], G_Modbus_ReadBuf[13]);
             G_PID_Ti := FUN_WordsToReal(G_Modbus_ReadBuf[14], G_Modbus_ReadBuf[15]);
             G_PID_Td := FUN_WordsToReal(G_Modbus_ReadBuf[16], G_Modbus_ReadBuf[17]);
             
             G_Modbus_WriteBuf[11] := 0; (* Ack *)
        ELSE
             G_Modbus_WriteBuf[11] := 0;
        END_IF;
        
        (* 3. Setpoint (Flag: HR18, Data: HR19-20) *)
        (* Unified for Auto and Tune *)
        IF (G_Modbus_ReadBuf[18] = 1) THEN
             G_Setpoint := FUN_WordsToReal(G_Modbus_ReadBuf[19], G_Modbus_ReadBuf[20]);
             G_Modbus_WriteBuf[18] := 0;
        ELSE
             G_Modbus_WriteBuf[18] := 0;
        END_IF;


        (* === TYPE 2: STATE MIRRORING (Status) === *)
        
        (* 1. Mode (Source: HR3 -> Ack: HR2) *)
        G_Modbus_WriteBuf[2] := G_Modbus_ReadBuf[3];

        (* 2. Web Status (Source: HR5 -> Ack: HR4) *)
        G_Modbus_WriteBuf[4] := G_Modbus_ReadBuf[5]; 

        (* 3. PLC Status (Source: HR7 -> Ack: HR6) *)
        G_Modbus_WriteBuf[6] := G_Modbus_ReadBuf[7];
        
        (* 4. Tune Start (Source: HR24 -> Ack: HR23) *)
        G_Modbus_WriteBuf[23] := G_Modbus_ReadBuf[24];
        
        (* 5. Tune Stop (Source: HR26 -> Ack: HR25) *)
        G_Modbus_WriteBuf[25] := G_Modbus_ReadBuf[26];
        
        
        (* === UPDATE MONITORING VALUES === *)
        (* Map Real MV to HR21-22 *)
        (* FUN_RealToWords(G_Current_MV, G_Modbus_WriteBuf[21], G_Modbus_WriteBuf[22]); *)
        
        (* === UPDATE TUNE DONE FLAG === *)
        (* If PID Tuning is Done, Set HR27=1. Gateway will clear it. *)
        (* IF G_Tune_Is_Done THEN G_Modbus_WriteBuf[27] := 1; END_IF; *)
        
        State := 30;

    30: (* WRITE REQUEST: Write HR0-29 *)
        FB_Write.Execute := TRUE;
        State := 31;
        
    31: (* WAIT FOR WRITE *)
        FB_Write();
        IF FB_Write.Done THEN
            FB_Write(Execute:=FALSE);
            State := 10; (* Loop back to Read *)
        ELSIF FB_Write.Error THEN
            FB_Write(Execute:=FALSE);
            State := 90;
        END_IF;

    90: (* ERROR RECOVERY *)
        (* ... retry logic ... *)
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
