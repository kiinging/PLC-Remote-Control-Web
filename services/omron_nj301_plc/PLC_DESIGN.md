# Omron NJ310 PLC Design Document

## 1. System Architecture
-   **Gateway**: Modbus TCP Client (Master)
-   **PLC**: Modbus TCP Server (Slave)
-   **IP/Port**: PLC IP (e.g., 192.168.0.10) Port 502 (Standard)

## 2. Task Allocation
| Task Name | Priority | Interval | Purpose |
| :--- | :--- | :--- | :--- |
| **PrimaryTask** | 4 | 4ms | Critical I/O, Safety, Fast Logic |
| **ControlTask** | 16 | 20ms | PID Loops, Scaling, Analog IO |
| **CommTask** | 17 | 20ms | Modbus TCP Server Logic & Mapping |

---

## 3. Data Types & Globals

### Modbus Server Memory Map
Instead of complex structures, we simply map variables to two global arrays which the Server Function Block accesses.

| Modbus Address | Variable Name | Type | Access | Description |
| :--- | :--- | :--- | :--- | :--- |
| **HR0** | `G_Seq_Num` |`WORD` | R/W | Heartbeat / Sequence Counter |
| **HR1-2** | `G_RTD_Temp` | `REAL` | Read Only | Process Value (Temp) |
| **HR3** | `G_Web_Status` | `INT` | Read Only | System Status |
| **HR4** | `G_Mode` | `INT` | Read Only | Auto/Manual Mode |
| **HR5** | `G_PLC_Status` | `INT` | Read Only | General Status |
| **HR6-7** | `G_Manual_MV` | `REAL` | Read Only | Manual MV Feedback |
| **HR8-9** | `G_Setpoint` | `REAL` | R/W | Setpoint |
| **HR10** | `G_Tune_Cmd` | `INT` | R/W | PID Tuning Command |
| **HR11-12** | `G_PID_PB` | `REAL` | R/W | Proportional Band |
| **HR13-14** | `G_PID_Ti` | `REAL` | R/W | Integral Time |
| **HR15-16** | `G_PID_Td` | `REAL` | R/W | Derivative Time |
| ... | ... | ... | ... | ... |
| **HR100-101** | `G_Current_MV` | `REAL` | Read Only | Current Output MV |

### Global Variables
| Name | Type | Initial | Comment |
| :--- | :--- | :--- | :--- |
| `G_Modbus_Registers` | `ARRAY[0..199] OF WORD` | - | **Main Modbus Storage** |
| `G_Modbus_Coils` | `ARRAY[0..199] OF BOOL` | - | **Main Modbus Coils** |
| `G_RTD_Temp` | `REAL` | 0.0 | Extracted Process Value |
| `G_Setpoint` | `REAL` | 0.0 | Target Temp |
| `G_Current_MV` | `REAL` | 0.0 | Output % |

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

## 5. CommTask Program (Modbus Server Wrapper)

This program wraps the `FB_ModbusServer` and handles data mapping between the PLC variables and the Modbus registers.

### Variables
| Name | Type | Initial | Comment |
| :--- | :--- | :--- | :--- |
| `FB_ModbusSrv` | `FB_ModbusServer` | - | Server Instance |
| `TCP_Socket` | `_sSOCKET` | - | Socket Handle |
| `R2W` | `FB_RealToWords` | - | Helper |
| `W2R` | `FB_WordsToReal` | - | Helper |

### Structured Text Code
```pascal
PROGRAM CommTask
VAR
    (* Function Block Instance *)
    FB_ModbusSrv : FB_ModbusServer;
    
    (* Socket for FB to use *)
    Local_Socket : _sSOCKET;
    
    (* Helpers *)
    R2W : FB_RealToWords;
    W2R : FB_WordsToReal;
    
    (* Local Temps *)
    TempReal : REAL;
END_VAR

(* ============================================= *)
(* 1. MAP PLC DATA -> MODBUS REGISTERS (Outputs) *)
(* ============================================= *)
(* Prepare data for the Gateway to READ *)

(* HR0: Sequence Number (Echo back if needed, or just let GW read) *)
G_Modbus_Registers[0] := G_Seq_Num;

(* HR1-2: RTD Temp (REAL) *)
R2W(InReal := G_RTD_Temp);
G_Modbus_Registers[1] := R2W.W_High;
G_Modbus_Registers[2] := R2W.W_Low;

(* HR3-5: Status (INT) *)
G_Modbus_Registers[3] := INT_TO_WORD(G_Web_Status);
G_Modbus_Registers[4] := INT_TO_WORD(G_Mode);
G_Modbus_Registers[5] := INT_TO_WORD(G_PLC_Status);

(* HR6-7: Manual MV Feedback (REAL) *)
R2W(InReal := G_Manual_MV);
G_Modbus_Registers[6] := R2W.W_High;
G_Modbus_Registers[7] := R2W.W_Low;

(* HR100-101: Current MV (REAL) *)
R2W(InReal := G_Current_MV);
G_Modbus_Registers[100] := R2W.W_High;
G_Modbus_Registers[101] := R2W.W_Low;

(* HR104: Tune Done *)
G_Modbus_Registers[104] := INT_TO_WORD(G_Tune_Done);

(* HR105-110: PID Output Params *)
R2W(InReal := G_PID_PB_Out);
G_Modbus_Registers[105] := R2W.W_High;
G_Modbus_Registers[106] := R2W.W_Low;

R2W(InReal := G_PID_Ti_Out);
G_Modbus_Registers[107] := R2W.W_High;
G_Modbus_Registers[108] := R2W.W_Low;

R2W(InReal := G_PID_Td_Out);
G_Modbus_Registers[109] := R2W.W_High;
G_Modbus_Registers[110] := R2W.W_Low;


(* ============================================= *)
(* 2. EXECUTE MODBUS SERVER FB                   *)
(* ============================================= *)

FB_ModbusSrv(
    Start := TRUE,
    Local_TcpPort := 502,
    ConnectionTimeout := T#5s,
    Reset_SdRcvCounter := FALSE,
    Registers := G_Modbus_Registers, (* Pass Global Array as IN_OUT *)
    Coils := G_Modbus_Coils          (* Pass Global Array as IN_OUT *)
);


(* ============================================= *)
(* 3. MAP MODBUS REGISTERS -> PLC DATA (Inputs)  *)
(* ============================================= *)
(* Process data written by the Gateway *)

(* HR8-9: Setpoint (REAL) *)
G_Setpoint := FUN_WordsToReal(G_Modbus_Registers[8], G_Modbus_Registers[9]);

(* HR10: Tune Cmd *)
G_Tune_Cmd := WORD_TO_INT(G_Modbus_Registers[10]);

(* HR11-16: PID Params *)
G_PID_PB := FUN_WordsToReal(G_Modbus_Registers[11], G_Modbus_Registers[12]);
G_PID_Ti := FUN_WordsToReal(G_Modbus_Registers[13], G_Modbus_Registers[14]);
G_PID_Td := FUN_WordsToReal(G_Modbus_Registers[15], G_Modbus_Registers[16]);

END_PROGRAM
```

## 6. FB_ModbusServer (Source Code)

Create a Function Block named `FB_ModbusServer`.
- **Inputs**: `Start` (BOOL), `Local_TcpPort` (UINT), `ConnectionTimeout` (TIME), `Reset_SdRcvCounter` (BOOL).
- **In-Outs**: `Registers` (ARRAY[*] OF WORD), `Coils` (ARRAY[*] OF BOOL).
- **Internal Variables**:
    - `TCP_Status_Inst` : `SktGetTCPStatus`
    - `TCP_Accept_Inst` : `SktTCPAccept`
    - `TCP_Recv_Inst` : `SktTCPRcv`
    - `TCP_Send_Inst` : `SktTCPSend`
    - `TCP_Close_Inst` : `SktClose`
    - `TCP_Socket` : `_sSOCKET`
    - `Recv_Data` : `ARRAY[0..1999] OF BYTE`
    - `Send_Data` : `ARRAY[0..1999] OF BYTE`
    - `TCP_Step` : `INT`
    - `TCP_Status` : `_eTCP_STATUS`
    - `Connected` : `BOOL`
    - `IP_Client` : `STRING[256]`
    - `Port_Client` : `UINT`
    - `Recv_Data` : `ARRAY[0..1999] OF BYTE`
    - `Send_Data` : `ARRAY[0..1999] OF BYTE`
    - `Send_Size` : `UINT`
    - `Address`, `Qty` : `UINT`
    - `Funct_Code` : `INT`
    - `Reg_Max`, `Coil_Max` : `UINT`
    
```pascal
(* Sysmac Studio ST - FB_ModbusServer Body *)

//-----------------------------------------------------------------------------------
//                                 Modbus TCP Server for NJ/NX Controller
//-----------------------------------------------------------------------------------

IF TCP_Socket.Handle >0 THEN																// TCP Status only available when Socket exists
	
	TCP_Status_Inst(Execute:=TRUE,Socket:=TCP_Socket);		
	IF (TCP_Status_Inst.Done)  or TCP_Status_Inst.Error THEN
			TCP_Status :=			TCP_Status_Inst.TcpStatus;
			Connected:=			(TCP_Status = _ESTABLISHED);
			IF TCP_Status_Inst.DatRcvFlag THEN 	TCP_Step:=	5;	END_IF;	// --> Reception
			IF TCP_Status= _CLOSE_WAIT OR Start = FALSE 	THEN  	TCP_Step:=	9;	END_IF;	// --> Close
			TCP_Status_Inst(Execute:=FALSE,Socket:=TCP_Socket);
	END_IF;

ELSE
	Connected:=FALSE;
END_IF;

IF Reset_SdRcvCounter THEN SdRcv_Counter:=0; END_IF;
	
// Check if a delay was setup. 
IF ConnectionTimeout > T#0.000ms THEN
	TCP_Wait(In:=TCP_Step=4, PT:=ConnectionTimeout);					//Check if client has gone
	IF TCP_Wait.Q THEN TCP_Step:=9; TCP_Wait.In:= FALSE; END_IF;
END_IF;

CASE TCP_Step OF

0: 	//Init

		TCP_Status_Inst(Execute:=	FALSE);
		TCP_Accept_Inst(Execute:=	FALSE);
		TCP_Recv_Inst(Execute:=		FALSE,RcvDat :=Recv_Data[0]);
		TCP_Send_Inst(Execute:=		FALSE, SendDat:=Send_Data[0]);
		TCP_Close_Inst(Execute:=	FALSE);
		Error:=					FALSE;
		ErrorID:=				0;
		IP_Client:=			'';
		Port_Client:=		0;
		Connected:=		FALSE;
		TCP_Step:=			1;
		
1: // waiting for Start Input

		IF Start THEN TCP_Step:=INT#2;END_IF;							// --> Open socket

2:	//  Connect --------------------------------------------------------------------

		IP_Client:='';
		Port_Client:=0;
		TCP_Accept_Inst(Execute:=TRUE,
						SrcTcpPort:=	Local_TcpPort,
						TimeOut:=		0,
						Socket => 		TCP_Socket);

			IF (TCP_Accept_Inst.Done)  THEN 
				TCP_Accept_Inst(Execute:=FALSE);
				IP_Client:= TCP_Socket.DstAdr.IpAdr;
				Port_Client:=TCP_Socket.DstAdr.PortNo;
				TCP_Step:=	3;

			ELSIF (TCP_Accept_Inst.Error) THEN 
				Error:=			TRUE;
				ErrorID:=		TCP_Accept_Inst.ErrorID;
				TCP_Step:=	8;
			END_IF;	
			
			
3:	    //Wait for status Established 
		IF Connected THEN TCP_Step	:=4; END_IF;				
			
4:  // waiting here for a request or disconnection---------------------------------------
	
		IF NOT Start THEN TCP_Step:=	9;END_IF;								// --> close socket	
		IF TCP_Status= _CLOSED THEN TCP_Step:=0;	END_IF;		// --> init	
						
5:	// Receive request --------------------------------------------------------------

		Error:=		FALSE;
		ErrorID:=	16#0;
		
		TCP_Recv_Inst(	Execute:=TRUE,
						Socket:=		TCP_Socket,
						Timeout:=	0,
						Size:=			UINT#255,
						RcvDat := 	Recv_Data[0]);
						
		IF (TCP_Recv_Inst.Done)  THEN
			IF TCP_Recv_Inst.RcvSize >8 THEN
				TCP_Step:= 		6;																	// --> process request
				TCP_Recv_Inst(Execute:=FALSE,RcvDat :=Recv_Data[0]);
			ELSE																							// incorrect size
				AryMove(Recv_Data[0],Send_Data[0],USINT#8);	
				Send_Data[5]:=3;
				Send_Data[7]:=BYTE#16#80 OR Recv_Data[7];
				Send_Data[8]:=3;
				Send_Size:=		9;
				TCP_Step:= 		8;																	// --> send response error
			END_IF;
		ELSIF (TCP_Recv_Inst.Error) THEN
			Error:=				TRUE;
			ErrorID:=			TCP_Recv_Inst.ErrorID;
			TCP_Step:=		8;
		END_IF;	



6:	// Process Modbus request --------------------------------------------------------
		Funct_Code:= BYTE_TO_INT(Recv_Data[7]);
		
		AryMove(Recv_Data[0],Send_Data[0],USINT#12);								// copy MBAP header and the two following word into the response
		//Send_Data[5]:=																					// length (to be calculate)
		AryByteTo(Recv_Data[8],UINT#2,_HIGH_LOW,Address);						// address	
		AryByteTo(Recv_Data[10],UINT#2,_HIGH_LOW,Qty);							// quantity
		
		// limits
		Reg_Max := DINT_TO_UINT(UPPER_BOUND(ARR:=Registers, DIM:=1)) + 1;
		Coil_Max:=DINT_TO_UINT(UPPER_BOUND(ARR:=Coils, DIM:=1)) + 1;
		
					
		CASE Funct_Code OF
			
			1,2: // Read Coils/discret inputs
			IF Qty = 0 or Qty > 1024  or Address+Qty > Coil_Max THEN 													// wrong address or quantity
				Send_Data[4]:=0;
				Send_Data[5]:=3;																		//Total frame length (MBAP header)
				Send_Data[7]:=INT_TO_BYTE(INT#16#80 + Funct_Code);
				Send_Data[8]:=03;
				Send_Size:=	9;
			ELSE
				QtyMod8:= Qty MOD 8;
				QtyByte := (Qty - QtyMod8)/8;

				IF QtyMod8 > 0 THEN 
					QtyUnfriendly:=	TRUE;
					QtyLess := 			Qty -QtyMod8; 					
				ELSE
					QtyLess := 			Qty;	
					QtyUnfriendly:=	FALSE;
				END_IF;
					
				idxByte	 :=		8;																	// initialize index
				RegCoil.Reg:=	0;																	// initialize Union temp variable
				idxCoil:=			0;
				FOR i:= 1 TO QtyByte DO	
					idxByte	 :=idxByte + 1;	
					AryMove(Coils[Address + idxCoil],RegCoil.Coil[0],8);
					Send_Data[idxByte] :=WORD_TO_BYTE(RegCoil.Reg);						
					idxCoil:=idxCoil+8;
				END_FOR;

				//adding coil remaining and fill with 0 last bits
				IF QtyUnfriendly = TRUE THEN
					RegCoil.Reg:=		0;
					idxByte	 :=			idxByte + 1;	
					AryMove(Coils[Address + idxCoil],RegCoil.Coil[0],QtyMod8);
					Send_Data[idxByte] :=WORD_TO_BYTE(RegCoil.Reg);
				END_IF;
				Send_Data[8]:= 	UINT_TO_BYTE(idxByte - 8);						// Byte number containing the coils			
				Send_Data[5]:= 	UINT_TO_BYTE(idxByte - 5);						// MBAP Header qty
				Send_Size:=			idxByte+1 ;												// total size for TCP_Send function	
			END_IF;		
			TCP_Step:=			7;																	// --> send

		
			3,4:  // Read Holding Registers	Fn03
				
				IF Qty = 0 or Qty > 1024 OR Address + Qty > Reg_Max THEN 			// wrong address or quantity
					Send_Data[4]:=	0;
					Send_Data[5]:=	3;																			//Total frame length (MBAP header)
					Send_Data[7]:=	INT_TO_BYTE(INT#16#80 + Funct_Code);
					Send_Data[8]:=	03;
					Send_Size:=			9;

				ELSE	
					idxByte	 :=9;																		// initialize index
					FOR i:= 1 TO Qty DO														// add register in the send request
						ToAryByte(Registers[Address-1 + i],_HIGH_LOW,Send_Data[idxByte]);
						idxByte									:=idxByte + 2;
					END_FOR;
					
					Send_Data[5]:= 	UINT_TO_BYTE(Qty*2 + 3);
					Send_Data[8]:= 	UINT_TO_BYTE(Qty*2);
					Send_Size:=			Qty*2 + 9;
				END_IF;			
				TCP_Step:=			7;																	// --> send			
					
			5:	// Write coil		Fn05
					IF Address  > Coil_Max THEN 												// wrong address 
						Send_Data[4]:=	0;
						Send_Data[5]:=	3;															//Total frame length (MBAP header)
						Send_Data[7]:=	INT_TO_BYTE(INT#16#80 + Funct_Code);
						Send_Data[8]:=	03;
						Send_Size:=			9;
					else
						IF Recv_Data[10]=BYTE#16#FF THEN 
							Coils[Address]:=	TRUE;
						ELSIF Recv_Data[10]=BYTE#00 THEN
							Coils[Address]:=	FALSE;
						END_IF;
						Send_Data[5]:=	6;
						Send_Size:=			UINT#12;
					END_IF;
						TCP_Step:=			7;															// --> send
					
					
			6:  //  Write single register Fn06
					IF Address > Reg_Max THEN 												// wrong address 
						Send_Data[4]:=	0;
						Send_Data[5]:=	3;															//Total frame length (MBAP header)
						Send_Data[7]:=	INT_TO_BYTE(INT#16#80 + Funct_Code);
						Send_Data[8]:=	03;
						Send_Size:=			9;
					ELSE
						AryByteTo(Recv_Data[10],UINT#2,_HIGH_LOW,Registers[Address]);
						Send_Data[5]:=	6;
						Send_Size:=			UINT#12;
					END_IF;
					TCP_Step:=			7;														// --> send
					
			8: // Echo back
					AryMove(Recv_Data[0],Send_Data[0],TCP_Recv_Inst.RcvSize);
					Send_Size:=			TCP_Recv_Inst.RcvSize;
					TCP_Step:=			7;														// --> send	
					
			15: // Write multiple Coils Fn0F

					 IF Qty = 0 or Qty > 1024 or Address+Qty > Coil_Max THEN                     // wrong address or quantity
						Send_Data[4]:=			0;
						Send_Data[5]:=			3;                                              							//Total frame length (MBAP header)
						Send_Data[7]:=			INT_TO_BYTE(INT#16#8F);
						Send_Data[8]:=			03;
						Send_Size:=         		 9;
					 ELSE
						QtyMod8:= 					Qty MOD 8;
						QtyByte := 					(Qty - QtyMod8)/8;

  						IF QtyMod8 > 0 THEN 
							QtyUnfriendly:=  		TRUE;
							QtyLess :=				Qty -QtyMod8;                                                                    
						ELSE
							QtyLess := 				Qty;        
							QtyUnfriendly:=  		FALSE;
						END_IF;
						IF QtyByte>0 THEN
							FOR i:= 0 TO (QtyByte-1) DO
								AryByteTo(Recv_Data[13+i],1,_LOW_HIGH,TempCoils);                                                                            
								AryMove(TempCoils[0], Coils[Address+i*8], UINT#8);
							END_FOR;
						END_IF;

						//adding coil remaining
						IF QtyUnfriendly = 	TRUE THEN
							AryByteTo(Recv_Data[13+QtyByte],UINT#1,_LOW_HIGH,TempCoils);                           
							FOR i:= 0 TO (QtyMod8-1) DO
								Coils[Address+QtyLess+i]:=TempCoils[i];     
							END_FOR;
						END_IF;
					Send_Data[5]:= 			6;
					Send_Size:=         		UINT#12;            // total size for TCP_Send function              
				END_IF;                                
                TCP_Step:=						 7;                      // --> send

			
			16: // Write multiple registers Fn10
					IF Qty = 0 or Qty > 1024 OR Address + Qty > Reg_Max THEN 					// wrong address or quantity
						Send_Data[4]:=	0;
						Send_Data[5]:=	3;																					//Total frame length (MBAP header)
						Send_Data[7]:=	INT_TO_BYTE(INT#16#80 + Funct_Code);
						Send_Data[8]:=	03;
						Send_Size:=			9;
					ELSE
						ByteRequested:=		UINT#13 + BYTE_TO_UINT(Recv_Data[12]);
					
						IF (ByteRequested = TCP_Recv_Inst.RcvSize)  AND Qty = BYTE_TO_UINT(Recv_Data[12]) / 2 THEN
							FOR i:= 1 TO (Qty) DO
								AryByteTo(Recv_Data[11 + i *2], UINT#2,_HIGH_LOW,Registers[Address -1 + i]);
							END_FOR;
							Send_Data[5]:=	6;
							Send_Size	:=			UINT#12;
						ELSE
							Send_Data[4]:=	0;
							Send_Data[5]:=	3;	
							Send_Data[7]:=	BYTE#16#90;
							Send_Data[8]:=	03;
							Send_Size:=			9;
						END_IF;
					END_IF;
					TCP_Step:=			7;														// --> send
					
			23: // Read Write registers Fn17	
					AryByteTo(Recv_Data[12],UINT#2,_HIGH_LOW,Address2);		// Write address2	
					AryByteTo(Recv_Data[14],UINT#2,_HIGH_LOW,Qty2);				// Write quantity2
					IF Qty = 0 or Qty > 125  OR Qty2= 0 OR Qty2 > 125 OR Address + Qty > Reg_Max OR Address2 + Qty2 > Reg_Max THEN 									// wrong quantity
						Send_Data[4]:=	0;
						Send_Data[5]:=	3;													//Total frame length (MBAP header)
						Send_Data[7]:=	INT_TO_BYTE(INT#16#80 + Funct_Code);
						Send_Data[8]:=	03;
						Send_Size:=			9;
					ELSE	
						idxByte	 :=9;																// initialize index
						FOR i:= 1 TO Qty DO												// add register in the send request
							ToAryByte(Registers[Address-1 + i],_HIGH_LOW,Send_Data[idxByte]);
							idxByte									:=idxByte + 2;
						END_FOR;
											
						Send_Data[5]:= 	UINT_TO_BYTE(Qty*2 + 3);
						Send_Data[8]:= 	UINT_TO_BYTE(Qty*2);
						Send_Size:=			Qty*2 + 9;
						
						// Write data

						FOR i:= 1 TO (Qty2) DO
							AryByteTo(Recv_Data[15 + i *2], UINT#2,_HIGH_LOW,Registers[Address2 -1 + i]);
						END_FOR;		
					END_IF;
					TCP_Step:=			7;																		// --> send
		
		
		
		ELSE				// illegal function	
				Send_Data[4]:=	0;
				Send_Data[5]:=	3;																			//Total frame length (MBAP header)
				Send_Data[7]:=	INT_TO_BYTE(INT#16#80 + Funct_Code);
				Send_Data[8]:=	1;
				Send_Size:=			9;
				TCP_Step:=			7;																			// --> send
		END_CASE;		

7:	//  Send response ----------------------------------------------------------------				
		
		TCP_Send_Inst(	Execute:=TRUE,
						Socket:=TCP_Socket,
						SendDat:=Send_Data[0],
						Size:=Send_Size);
						
		IF (TCP_Send_Inst.Done) OR (TCP_Send_Inst.Error) THEN
			TCP_Send_Inst(Execute:=FALSE, SendDat:=Send_Data[0]);
			IF (TCP_Send_Inst.Error) THEN
				Error:=		TRUE;
				ErrorID:=	TCP_Send_Inst.ErrorID;
			ELSE
				SdRcv_Counter:=SdRcv_Counter + 1;
			END_IF;
			TCP_Step:=	8;
		END_IF;		
		
8:	// reset  -----------------------------------------------------------------------	
		TCP_Recv_Inst(Execute:=FALSE,RcvDat :=Recv_Data[0]);
		TCP_Send_Inst(Execute:=FALSE,SendDat:=Send_Data[0]);
		TCP_Step:=	4;

9:	// Close socket -----------------------------------------------------------------

		TCP_Close_Inst(	Execute:=TRUE,Socket:=Tcp_Socket);
		IF(TCP_Close_Inst.Done) OR (TCP_Close_Inst.Error) THEN TCP_Step:=0;END_IF;	

END_CASE;
```



## resources:
https://www.myomron.com/index.php?action=kb&article=1245%2F1000&utm_source=chatgpt.com

