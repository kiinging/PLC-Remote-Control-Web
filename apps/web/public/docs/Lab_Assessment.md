# Industrial Automated Systems — Lab 4 & 5 Assessment
## Pre-Lab / Post-Lab Quiz Questions

**Instructions**: Please answer the following 5 questions. This quiz will be administered twice: once before starting Lab 4A (Pre-Quiz) and once after completing Lab 4B (Post-Quiz).

---

### Question 1: Proportional Band (PB)
In a PID controller (specifically the Omron NJ series), what does the **Proportional Band (PB)** primarily control?

**A)** The steady-state error elimination rate.  
**B)** The overall responsiveness to the error (a larger PB makes the controller *less* sensitive).  
**C)** The prediction of future error trends.  
**D)** The filtering of high-frequency sensor noise.

**Your Answer:** _______

---

### Question 2: Integral Time (Ti)
What is the effect of increasing the **Integral Time ($T_i$)** on the controller's response?

**A)** It makes the integration more aggressive, eliminating error faster but increasing oscillation.  
**B)** It slows down the elimination of steady-state error (less aggressive integration).  
**C)** It directly increases the proportional gain of the system.  
**D)** It has no effect on the steady-state error.

**Your Answer:** _______

---

### Question 3: Reaction Curve Method
In the **Ziegler-Nichols Open-Loop (Reaction Curve)** method, which two key parameters must be extracted from the process reaction curve to calculate the PID values?

**A)** Peak Temperature and Settling Time.  
**B)** Dead Time ($L$) and Reaction Rate ($R$ or $N$).  
**C)** Setpoint and Manipulated Variable (MV).  
**D)** Rise Time and Overshoot.

**Your Answer:** _______

---

### Question 4: Overshoot Reduction
If you observe a large **overshoot** in the system response when changing the setpoint, which parameter change is most likely to improve stability and reduce that overshoot?

**A)** Increase the Proportional Band (PB).  
**B)** Decrease the Proportional Band (PB).  
**C)** Decrease the Derivative Time ($T_d$).  
**D)** Set the Integral Time ($T_i$) to zero.

**Your Answer:** _______

---

### Question 5: Derivative Term (Td)
What is the primary purpose of the **Derivative ($T_d$)** term in a PID control loop?

**A)** To ensure the output eventually reaches the setpoint (zero steady-state error).  
**B)** To provide a "braking" or damping effect by responding to the *rate of change* of the error.  
**C)** To provide a constant bias to the heater power.  
**D)** To increase the speed of the initial response.

**Your Answer:** _______

---
