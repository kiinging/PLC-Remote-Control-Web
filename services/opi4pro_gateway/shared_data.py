# shared_data.py
# Shared memory for both sensor.py and web_api.py.
from multiprocessing import Manager

manager = Manager()
data = manager.dict()

# ---------------- Measurements ----------------
data["rtd_temp"] = None
data["thermo_temp"] = None
data["internal_temp"] = None
data["fault"] = False
data["last_update"] = None
data["last_update_ts"] = None  # Timestamp of last sensor reading (for heartbeat health check)
data["modbus_last_tick_ts"] = None  # Timestamp of last modbus loop tick (for heartbeat health check)

# ---------------- Control & Process Vars ----------------
data["mv"] = None              # Manipulated Variable calculated by the PID (0–100% PWM)
data["mv_manual"] = 0          # MV manually set by operator
data["pv_source"] = "rtd"      # PV source: "rtd" or "thermo"
data["sensor_select"] = 0      # 0 = thermo, 1 = rtd

# ---------------- Trend Buffer ----------------
# Logs: [{"time": "12:30:02", "pv": 65.2, "mv": 23.5}, ...]
data["trend"] = manager.list()

# ---------------- Actuator States ----------------
data["light"] = 0     # light: 0=OFF, 1=ON
data["power_on"] = 0  # heater element: 0=OFF, 1=ON
data["plc"] = 0       # on/off system: 0=OFF, 1=ON
data["mode"] = 0    # default mode at startup is manual: 0=manual, 1=auto,  2=tune

# ---------------- Control Parameters ----------------
data["web"] = 0  # Setpoint source: 0 → use HMI, 1 → use Web
data["setpoint"] = 30.0
data["pid_pb"] = 10.0
data["pid_ti"] = 180.0
data["pid_td"] = 60.0

# ---------------- Setpoint Handshake ----------------
data["setpoint_update_pending"] = False   # True when new setpoint sent by web
data["setpoint_acknowledged"] = True      # PLC resets HR18 → 0 to confirm

# ---------------- PID Handshake ----------------
data["pid_update_pending"] = False
data["pid_acknowledged"] = True

# ---------------- Manual MV Handshake ----------------
data["mv_manual_update_pending"] = False   # True when new manual MV sent by web
data["mv_manual_acknowledged"] = True      # PLC resets HR21 → 0 to confirm 

# ---------------- Tune Auto Handshake ----------------
data["tune_setpoint"] = 30.0
data["tune_setpoint_update_pending"] = False
data["tune_setpoint_acknowledged"] = True

data["tune_start_pending"] = False
data["tune_start_acknowledged"] = True
data["tune_in_progress"] = False
data["tune_completed"] = False

data["tune_stop_pending"] = False
data["tune_stop_acknowledged"] = True





