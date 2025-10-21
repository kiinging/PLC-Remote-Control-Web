## 🧭 GOAL OVERVIEW
Frontend “Auto-Tune” buttons to:

1. Send a **tune setpoint** to Flask → shared_data → Modbus (HR24 + HR18–19).
2. Wait for **PLC acknowledgment** (`HR24` → 0).
3. When you click **Start**, it sets HR25 = 1 → PLC starts tuning.
4. When PLC finishes tuning, it writes HR27 = 1.
5. Flask detects HR27 = 1 → marks `tune_completed = True`.
6. Frontend sees `tune_completed` and refreshes the new PID values.

---

## ✅ HR mapping consistency

Based on your Modbus comments:

| Function       | HR Register(s) | Handshake flag | Float data |
| -------------- | -------------- | -------------- | ---------- |
| Tune Setpoint  | HR24, HR18–19  | HR24           | HR18–19    |
| Tune Start     | HR25           | HR25           | —          |
| Tune Stop      | HR26           | HR26           | —          |
| Tune Completed | HR27           | HR27           | —          |

Make sure your PLC:

* Sets **HR27 = 1** when tuning completes.
* Clears HR25 and HR26 to 0 after processing.
* Writes back PID params into HR11–16.

---

## ✅ Worker and Frontend logic

### Worker (Cloudflare Worker)

You already updated all `/tune_*` routes to include JSON headers — ✅ correct.


## ✅ Test sequence (real hardware)

Let’s confirm the full round-trip:

| Step | Action                                                | Expected Behavior                                                   |
| ---- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| 1️⃣  | Frontend sends `/tune_setpoint`                       | Flask sets flags → Modbus HR24=1, HR18–19=SP                        |
| 2️⃣  | PLC copies setpoint, then clears HR24=0               | Flask detects ack → `/tune_setpoint_ack` → `{"acknowledged": true}` |
| 3️⃣  | User clicks “Start Auto-Tune”                         | Flask sets HR25=1                                                   |
| 4️⃣  | PLC starts tuning, then clears HR25=0                 | Flask detects ack, sets `tune_in_progress=True`                     |
| 5️⃣  | When done, PLC writes HR27=1                          | Flask sets `tune_completed=True`                                    |
| 6️⃣  | Frontend sees `tune_completed` → refreshes PID values | UI indicator turns off, PID fields update                           |

---


---

## ✅ Step 8 — Optional improvement

To make the auto-tune UX cleaner, you can show a “Tuning…” spinner or disable all buttons while `tune_in_progress` is `true`.

---

## ✅ Final checklist summary

| File               | Action                                        |
| ------------------ | --------------------------------------------- |
| `shared_data.py`   | set `tune_in_progress=False`                  |
| `web_api.py`       | add `data["tune_setpoint"] = tune_sp`         |
| `modbus_server.py` | OK as-is (logic correct)                      |
| `worker.js`        | keep with JSON header, correct                |
| `script.js`        | optional input validation                     |
| PLC                | implement HR24/HR25/HR26/HR27 handshake logic |

---

If you want, I can draw a **signal flow diagram** (from Browser → Worker → Flask → Modbus → PLC → back) so you can visually confirm the handshake sequence.
Would you like that?
