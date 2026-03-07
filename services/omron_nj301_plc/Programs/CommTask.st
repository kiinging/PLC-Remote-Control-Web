(*
    CommTask_ModbusServer
    - PLC is Modbus TCP SERVER (slave)
    - Gateway/Web is Modbus TCP CLIENT (master)
*)

// =========================================================
// 1) Run the Modbus TCP Server FB EVERY scan
// =========================================================
MB_Server(
    Start             := StartServer,
    Local_TcpPort     := Local_TcpPort,
    ConnectionTimeout := ConnectionTimeout,
    Reset_SdRcvCounter:= Reset_SdRcvCounter,

    Registers         := Registers,
    Coils             := Coils,

    Connected         => Server_Connected,
    Error             => Server_Error,
    ErrorID           => Server_ErrorID,
    IP_Client         => IP_Client,
    Port_Client       => Port_Client,
    SdRcv_Counter     => SdRcv_Counter
);


// =========================================================
// 2) Heartbeat: increment when a Modbus transaction happened
//    (so it tracks real comm activity)
// =========================================================
IF SdRcv_Counter <> SdRcv_Last THEN
    SdRcv_Last := SdRcv_Counter;
    Heartbeat_Ctr := Heartbeat_Ctr + 1;
END_IF;


// =========================================================
// 3) Copy incoming gateway-written registers into your buffer
//    (HR0..HR16 -> G_Modbus_ReadBuf[0..16])
// =========================================================
FOR i := 0 TO 16 DO
    G_Modbus_ReadBuf[i] := Registers[i];
END_FOR;


// =========================================================
// 4) PROCESS (same as your old State 20)
// =========================================================
G_RTD_Temp := FUN_WordsToReal(G_Modbus_ReadBuf[1], G_Modbus_ReadBuf[2]);

New_Seq := G_Modbus_ReadBuf[0];

IF New_Seq <> Last_Seq_Num THEN
    G_Web_Status := WORD_TO_INT(G_Modbus_ReadBuf[3]);
    G_Mode       := WORD_TO_INT(G_Modbus_ReadBuf[4]);
    G_PLC_Status := WORD_TO_INT(G_Modbus_ReadBuf[5]);

    G_Manual_MV  := FUN_WordsToReal(G_Modbus_ReadBuf[6], G_Modbus_ReadBuf[7]);
    G_Setpoint   := FUN_WordsToReal(G_Modbus_ReadBuf[8], G_Modbus_ReadBuf[9]);

    G_StartAT   := WORD_TO_INT(G_Modbus_ReadBuf[10]);

    G_PID_PB     := FUN_WordsToReal(G_Modbus_ReadBuf[11], G_Modbus_ReadBuf[12]);
    G_PID_Ti     := FUN_WordsToReal(G_Modbus_ReadBuf[13], G_Modbus_ReadBuf[14]);
    G_PID_Td     := FUN_WordsToReal(G_Modbus_ReadBuf[15], G_Modbus_ReadBuf[16]);

    Last_Seq_Num := New_Seq;
END_IF;


// =========================================================
// 5) BUILD WRITE BUFFER (same as your old State 30)
//    (HR100..HR110 -> G_Modbus_WriteBuf[0..10])
// =========================================================
G_Modbus_WriteBuf[0] := Last_Seq_Num;                // HR100 ack seq
G_Modbus_WriteBuf[1] := UINT_TO_WORD(Heartbeat_Ctr); // HR101 heartbeat

R2W_MV(InReal := G_Current_MV);
G_Modbus_WriteBuf[2] := R2W_MV.W_High;               // HR102
G_Modbus_WriteBuf[3] := R2W_MV.W_Low;                // HR103

G_Modbus_WriteBuf[4] := G_ATDone;    // HR104 tune done

R2W_PB(InReal := G_PID_PB_Out);
G_Modbus_WriteBuf[5] := R2W_PB.W_High;               // HR105
G_Modbus_WriteBuf[6] := R2W_PB.W_Low;                // HR106

R2W_Ti(InReal := G_PID_Ti_Out);
G_Modbus_WriteBuf[7] := R2W_Ti.W_High;               // HR107
G_Modbus_WriteBuf[8] := R2W_Ti.W_Low;                // HR108

R2W_Td(InReal := G_PID_Td_Out);
G_Modbus_WriteBuf[9]  := R2W_Td.W_High;              // HR109
G_Modbus_WriteBuf[10] := R2W_Td.W_Low;               // HR110

R2W_Setpoint(InReal := G_Eff_Setpoint);
G_Modbus_WriteBuf[11]  := R2W_Setpoint.W_High;              // HR111
G_Modbus_WriteBuf[12]  := R2W_Setpoint.W_Low;               // HR112

R2W_PB_AT(InReal := G_PID_PB_AT);
G_Modbus_WriteBuf[13]  := R2W_PB_AT.W_High;                 // HR113
G_Modbus_WriteBuf[14]  := R2W_PB_AT.W_Low;                  // HR114

R2W_Ti_AT(InReal := G_PID_Ti_AT);
G_Modbus_WriteBuf[15]  := R2W_Ti_AT.W_High;                 // HR115
G_Modbus_WriteBuf[16]  := R2W_Ti_AT.W_Low;                  // HR116

R2W_Td_AT(InReal := G_PID_Td_AT);
G_Modbus_WriteBuf[17]  := R2W_Td_AT.W_High;                 // HR117
G_Modbus_WriteBuf[18]  := R2W_Td_AT.W_Low;                  // HR118


// =========================================================
// 6) Copy your write buffer into server registers
//    (G_Modbus_WriteBuf -> HR100..HR118)
// =========================================================
FOR i := 0 TO 18 DO
    Registers[100 + i] := G_Modbus_WriteBuf[i];
END_FOR;
