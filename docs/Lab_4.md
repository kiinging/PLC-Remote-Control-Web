# Lab 4: Ziegler-Nichols Open-Loop Method

## 1. Introduction and Objectives
This lab introduces a remote-monitored PID temperature control system. It integrates industrial hardware with web technologies to enable remote experimentation.

**Objectives:**
1.  Familiarize with the remote control system's interface and operation.
2.  Characterize the dynamic response of the thermal process.
3.  Determine optimal PID control parameters for the thermal process.

## 2. System Architecture
### 2.1 Architecture Diagram
![System Architecture](images/systemSetup.png)

### 2.2 Hardware Components
-   **Plant**: 50 &Omega; power resistor (24V DC heating element).
-   **Final Control Element**: MOSFET switch (PWM modulated).
-   **Controller**: Omron NJ301 PLC and NA5 HMI.
-   **Sensor**: RTD (PT100) for temperature feedback.
-   **Gateway**: Orange Pi 4 Pro (Bridges industrial network to the internet).
-   **Web App**: Cloudflare-hosted dashboard for remote access.

### 2.3 Communication Flow
Temperature data is acquired from the RTD sensor by the Gateway via SPI. This information is synchronized with the PLC using Modbus TCP, where the PID control logic calculates the required output and drives the MOSFET via PWM. Users can remotely monitor and control the system through the web application, which polls the Gateway API for real-time updates and command dispatch.

---

## 3. Equipment & Software
-   **Hardware**: Omron NJ301 PLC, NA5 HMI, Orange Pi 4 Pro Gateway, 50 &Omega; Resistor, MOSFET Switch, RTD PT100.
-   **Software**: 
    -   Web Dashboard (Standard Browser).
    -   Omron Sysmac Studio (For PLC logic review - Optional).

## 4. Experiment Procedure

### 4.1 System Initialization
1.  Navigate to the **Web Dashboard** provided by your instructor.
2.  Log in with your assigned credentials.
3.  Observe the **Live View (Video Stream)** and verify the hardware is visible and the stack light is active.
4.  Check the **Control Status**: Ensure the system is "OFF" initially and the RTD reads ambient temperature.

### 4.2 Manual Control (Open-Loop)
1.  Switch the system to **Manual Mode**.
2.  Set the **Manual MV (Manipulated Variable)** to **20%**.
3.  Click "Process Power ON" and observe the temperature rise.
4.  Wait for the temperature to stabilize for 2 minutes. Record the **Steady State Temperature**.
5.  Increase the MV to **50%** and repeat the observation.
6.  Set MV to **0%** and allow the system to cool down.

### 4.3 Auto Control (Closed-Loop)
1.  Switch the system to **Auto Mode**.
2.  Set the **Temperature Setpoint** to **45.0 &deg;C**.
3.  Click "PLC Start" to begin the control loop.
4.  Monitor the **Live Chart**: Observe the overshoot, settling time, and steady-state error.
5.  Record the time taken to reach within &plusmn;1&deg;C of the setpoint.

### 4.4 PID Auto-Tuning
1.  With the system running, switch to **Tune Mode**.
2.  Enter a target setpoint of **45.0 &deg;C**.
3.  Click **"Start Auto-Tune"**.
4.  The system will perform several oscillations. **Do not interrupt** the process.
5.  Once the "Tuning Complete" message appears, review the newly calculated **P-Band (PB)**, **I-Time (Ti)**, and **D-Time (Td)** values.
6.  Apply these values and compare the performance with the previous Auto Mode run.

## 5. Data Collection
| Stage | MV (%) / Setpoint (&deg;C) | Result (Steady Temp / Settling Time) | Notes |
| :--- | :--- | :--- | :--- |
| Manual | 20% |  |  |
| Manual | 50% |  |  |
| Auto | 45.0 &deg;C |  |  |
| Auto-Tune | 45.0 &deg;C |  |  |

## 6. Analysis & Discussion Questions
1.  **Open-Loop Response**: Why does the temperature eventually reach a steady state even in manual mode?
2.  **Control Parameters**: Explain the effect of increasing the P-Band (PB) on the system's responsiveness.
3.  **Efficiency**: Compare the manual control effort to the auto-control mode. Which is more stable under disturbance?
4.  **Communication Latency**: Did you notice any delay between clicking a button on the web app and the hardware response? Discuss potential causes.

---
*End of Lab 4 Sheet*
