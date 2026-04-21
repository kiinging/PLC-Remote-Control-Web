# Lab 4: PID Tuning - Open-Loop Transient Response Method

## Objective
The goal of this lab is to determine the PID parameters ($K_p$, $T_i$, $T_d$) of a temperature control system using the **Open-Loop Transient Response Method** (also known as the **Process Reaction Curve Method**).

---

## 1. Background: The Open-Loop Technique
In an open-loop test, the controller is set to **Manual Mode**. A sudden step change is applied to the Manipulated Variable (MV), and the resulting response of the Process Variable (PV) is recorded.

### Why find the max temperature at 100% MV?
Yes, it is important to know the steady-state value at maximum output. This tells you the **Process Gain ($K$)**:
$$K = \frac{\Delta PV_{max}}{\Delta MV_{max}}$$
Knowing the full range of the process helps in normalizing the response and understanding the physical limits of your system.

---

## 2. Experimental Procedure

1. **Initialization**: 
   - Set the system to **Manual Mode**.
   - Set the **MV to 40%**.
   - Wait for the **PV (Temperature)** to stabilize (steady state).

2. **Step Change**:
   - Increase the **MV to 42%** (a 2% step change).
   - Observe the **Trend Chart**. The PV will start to rise and eventually reach a new steady state, forming an "S-shaped" curve.

3. **Data Collection**:
   - Export the trend data as a CSV once the new steady state is reached.
   - You will use this data to calculate the slope and the dead time.

---

## 3. Calculations

### Process Reaction Rate ($N$)
The slope of the tangent line at the point of inflection is the **Process Reaction Rate ($N$)**.
$$N = \frac{\Delta PV}{\Delta \text{Time}}$$
*Note: Ensure your time units are consistent (usually seconds or minutes).*

### Dead Time ($L$)
The distance from the time the MV was changed to the time where the tangent line intersects the original steady-state PV value.

### Controller Settings (Ziegler-Nichols)

| Mode | Proportional Gain ($K_p$) | Integral Time ($T_i$) | Derivative Time ($T_d$) |
| :--- | :--- | :--- | :--- |
| **P** | $K_p = \frac{\Delta MV}{N \cdot L}$ | - | - |
| **PI** | $K_p = 0.9 \cdot \frac{\Delta MV}{N \cdot L}$ | $T_i = 3.33 \cdot L$ | - |
| **PID** | $K_p = 1.2 \cdot \frac{\Delta MV}{N \cdot L}$ | $T_i = 2 \cdot L$ | $T_d = 0.5 \cdot L$ |

*Where $\Delta MV$ is the magnitude of the step change (e.g., 2% if you went from 40% to 42%).*

---

## 4. Omron NJ301 PLC Implementation

> [!IMPORTANT]
> The Omron NJ301 CPU uses **Proportional Band ($PB$)** instead of **Gain ($K_p$)**.

### Conversion Formula
To enter your calculated $K_p$ into the Omron PLC, you must convert it to $PB$ using the following formula:
$$PB = \frac{100}{K_p}$$

*   **Higher Gain ($K_p$)** = **Lower Proportional Band ($PB$)** (more aggressive).
*   **Lower Gain ($K_p$)** = **Higher Proportional Band ($PB$)** (more conservative).

### Units Checklist
- **Proportional Band ($PB$)**: Percentage (%)
- **Integral Time ($T_i$)**: Usually seconds
- **Derivative Time ($T_d$)**: Usually seconds

---

## 5. Summary Checklist for Students
1. [ ] Reach steady state at 40% MV.
2. [ ] Step to 42% MV.
3. [ ] Capture the "S-curve" in the trend chart.
4. [ ] Identify the tangent at the inflection point to find $N$ (slope) and $L$ (dead time).
5. [ ] Calculate $K_p$, $T_i$, and $T_d$.
6. [ ] Convert $K_p$ to $PB$ for the NJ301 PLC.
7. [ ] Test the calculated values in **Auto Mode** and observe the response.
