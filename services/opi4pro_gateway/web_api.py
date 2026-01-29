# This allows the Cloudflare Worker to:
# Control the light
# Read temperatures from shared memory

# web_api.py
from flask import Flask, jsonify, request, send_from_directory
from database import db
import time
import os
import esp32_client
import config
import wiringpi

app = Flask(__name__)

# ---------------- GPIO Setup ----------------
# Using wiringpi for Orange Pi 4 Pro GPIO control
# wPi pin mapping: Physical pin 18 (PL2) maps to wPi pin 10
# Initialize wiringpi with BCM pin mode
# --- Initial state: ensure OFF --------------
try:
    wiringpi.wiringPiSetup()
    wiringpi.pinMode(config.LIGHT_PIN, wiringpi.OUTPUT)
    wiringpi.digitalWrite(config.LIGHT_PIN, 0)
    GPIO_AVAILABLE = True
except Exception as e:
    print(f"Wait, no root? GPIO failed: {e}")
    GPIO_AVAILABLE = False

# Initialize defaults in DB if missing
if db.get_state("light") is None: db.set_state("light", 0)
if db.get_state("plc") is None: db.set_state("plc", 0)
if db.get_state("power_on") is None: db.set_state("power_on", 0)

# =========================================================
# ------------ Static Files / HTML Pages -----------------
# =========================================================
@app.route('/test/gateway_monitor.html')
def serve_gateway_monitor():
    """Serve gateway_monitor.html from test folder"""
    test_dir = os.path.join(os.path.dirname(__file__), 'test')
    return send_from_directory(test_dir, 'gateway_monitor.html')

# =========================================================
# ---------------- Health Check / Heartbeat ---------------
# =========================================================
@app.route('/heartbeat', methods=['GET'])
def heartbeat():
    """
    Enhanced heartbeat endpoint for monitoring SBC + sensor + modbus health.
    Browser can poll every 1-2 seconds to detect if API is alive but sensors/modbus are dead.
    """
    current_time = time.time()
    
    # Sensor health check
    last_update_ts = db.get_state("last_update_ts")
    sensor_age_sec = None
    sensor_ok = False
    
    if last_update_ts is not None:
        sensor_age_sec = current_time - last_update_ts
        sensor_ok = sensor_age_sec <= 50  # 2s sampling, 5s is reasonable threshold
    
    # Modbus health check
    modbus_last_tick_ts = db.get_state("modbus_last_tick_ts")
    modbus_age_sec = None
    modbus_ok = False
    
    if modbus_last_tick_ts is not None:
        modbus_age_sec = current_time - modbus_last_tick_ts
        modbus_ok = modbus_age_sec <= 50  # 1s loop, 5s is reasonable threshold
    
    return jsonify({
        "status": "alive",
        "timestamp": current_time,
        "light": db.get_state("light", 0),
        "plc": db.get_state("plc", 0),
        "mode": db.get_state("mode", 0),
        "last_update": db.get_state("last_update"),
        "sensor_age_sec": sensor_age_sec,
        "sensor_ok": sensor_ok,
        "modbus_age_sec": modbus_age_sec,
        "modbus_ok": modbus_ok
    }), 200


# =========================================================
# ---------------- Light / Web / PLC Control --------------
# =========================================================
@app.route('/light/on', methods=['POST'])
def turn_light_on():
    if GPIO_AVAILABLE:
        wiringpi.digitalWrite(config.LIGHT_PIN, 1)
    db.set_state("light", 1)
    return jsonify({"light": 1}), 200

@app.route('/light/off', methods=['POST'])
def turn_light_off():
    if GPIO_AVAILABLE:
        wiringpi.digitalWrite(config.LIGHT_PIN, 0)
    db.set_state("light", 0)
    return jsonify({"light": 0}), 200

@app.route('/web/on', methods=['POST'])
def web_start():
    db.set_state("web", 1)
    return jsonify({"web": 1}), 200

@app.route('/web/off', methods=['POST'])
def web_stop():
    db.set_state("web", 0)
    return jsonify({"web": 0}), 200

@app.route('/plc/on', methods=['POST'])
def plc_on():
    db.set_state("plc", 1)
    return jsonify({"plc": 1}), 200

@app.route('/plc/off', methods=['POST'])
def plc_off():
    db.set_state("plc", 0)
    return jsonify({"plc": 0}), 200

# =========================================================
# ---------------- Mode Control ---------------------------
# =========================================================
@app.route('/mode/manual', methods=['POST'])
def mode_manual():
    db.set_state("mode", 0)
    return jsonify({"mode": 0}), 200

@app.route('/mode/auto', methods=['POST'])
def mode_auto():
    db.set_state("mode", 1)
    return jsonify({"mode": 1}), 200

@app.route('/mode/tune', methods=['POST'])
def mode_tune():
    db.set_state("mode", 2)
    return jsonify({"mode": 2}), 200

# =========================================================
# ---------------- Control + Temperature Status -----------
# =========================================================
# ---------------- Control Status ------------
@app.route('/control_status', methods=['GET'])
def get_control_status():
    return jsonify({
        "light": db.get_state("light"),
        "plc": db.get_state("plc"),
        "web": db.get_state("web"),
        "mode": db.get_state("mode")
    })


# ---------------- Temperature Status ----------------
@app.route('/temp', methods=['GET'])
def get_temperature():
    """Return both temperatures + control states"""
    return jsonify({
        "rtd_temp": db.get_state("rtd_temp"),
        "last_update": db.get_state("last_update"),
        # "light": db.get_state("light"),
        # "plc": db.get_state("plc"),
    })

# ---------------- Trend Buffer ----------------
@app.route('/trend', methods=['GET'])
def get_trend_data():
    # return last 900 records
    limit = request.args.get("limit", 900, type=int)
    trend_data = db.get_recent_trend(limit=limit)
    return jsonify(trend_data)

# =========================================================
# ---------------- Setpoint Control -----------------------
# =========================================================
@app.route('/setpoint', methods=['POST'])
def update_setpoint():
    """
    Receive setpoint from browser → save to shared_data → 
    signal Modbus thread to send via HR18 handshake flag.
    """
    try:
        req = request.get_json()
        sp = float(req.get("setpoint"))

        if sp > 80:
            sp = 80  # clamp max 80°C

        # Update shared memory
        db.set_state("setpoint", sp)
        db.set_state("setpoint_update_pending", True)
        db.set_state("setpoint_acknowledged", False)

        return jsonify({
            "status": "pending",
            "setpoint": sp
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/setpoint_ack', methods=['GET'])
def setpoint_status():
    """Return whether the latest setpoint update has been acknowledged by PLC."""
    try:
        acknowledged = db.get_state("setpoint_acknowledged", False)
        return jsonify({"acknowledged": acknowledged}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/setpoint_status', methods=['GET'])
def get_setpoint():
    return jsonify({"setpoint": db.get_state("setpoint", 0.0)})

# =========================================================
# ---------------- MV Manual Control ----------------------
# =========================================================
@app.route('/mv_manual', methods=['POST'])
def set_mv_manual():
    try:
        body = request.get_json()
        mv_value = float(body["mv_manual"])
        if mv_value < 0: mv_value = 0
        if mv_value > 100: mv_value = 100

        # Save MV and trigger handshake
        db.set_state("mv_manual", mv_value)
        db.set_state("mv_manual_update_pending", True)
        db.set_state("mv_manual_acknowledged", False)

        return jsonify({
            "status": "pending",
            "mv_manual": mv_value
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/mv_manual_ack', methods=['GET'])
def get_mv_manual_ack():
    """Return whether the latest manual MV update has been acknowledged by PLC."""
    try:
        acknowledged = db.get_state("mv_manual_acknowledged", False)
        return jsonify({"acknowledged": acknowledged}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/mv_manual_status', methods=['GET'])
def get_mv_manual_status():
    return jsonify({"mv_manual": db.get_state("mv_manual", 0)})

# =========================================================
# ---------------- PID Control ----------------------------
# =========================================================
@app.route('/pid', methods=['POST'])
def update_pid():
    try:
        req = request.get_json()
        pb = float(req.get("pb"))
        ti = float(req.get("ti"))
        td = float(req.get("td"))

        # ✅ Save into shared_data with flat keys
        db.set_state("pid_pb", pb)
        db.set_state("pid_ti", ti)
        db.set_state("pid_td", td)

        # mark update flags for Modbus loop
        db.set_state("pid_update_pending", True)
        db.set_state("pid_acknowledged", False)

        return jsonify({
            "status": "pending",
            "pb": pb,
            "ti": ti,
            "td": td
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/pid_params', methods=['GET'])
def get_pid():
    return jsonify({
        "pb": db.get_state("pid_pb", 1.0),
        "ti": db.get_state("pid_ti", 10.0),
        "td": db.get_state("pid_td", 0.0)
    })
    
@app.route('/pid_ack', methods=['GET'])
def pid_status():
    """Return whether the latest PID update has been acknowledged by PLC."""
    try:
        acknowledged = db.get_state("pid_acknowledged", False)
        return jsonify({"acknowledged": acknowledged}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ---------------- Tune Setpoint Control ----------------
# ---------------- Tune Setpoint (HR18–HR19 + HR24 flag) ----------------
@app.route('/tune_setpoint', methods=['POST'])
def tune_setpoint():
    try:
        req = request.get_json()
        tune_sp = float(req.get("tune_setpoint"))

        if tune_sp > 80: tune_sp = 80
        if tune_sp < 0: tune_sp = 0

        db.set_state("tune_setpoint", tune_sp)
        db.set_state("tune_setpoint_update_pending", True)
        db.set_state("tune_setpoint_acknowledged", False)

        return jsonify({
            "status": "pending",
            "tune_setpoint": tune_sp
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/tune_setpoint_ack', methods=['GET'])
def tune_setpoint_ack_status():
    """Return whether the latest tuning setpoint update has been acknowledged by PLC."""
    try:
        acknowledged = db.get_state("tune_setpoint_acknowledged", False)
        return jsonify({"acknowledged": acknowledged}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/tune_start', methods=['POST'])
def tune_start():
    """Tell PLC to begin tuning."""
    db.set_state("tune_start_pending", True)
    db.set_state("tune_start_acknowledged", False)
    db.set_state("tune_in_progress", True)
    db.set_state("tune_completed", False)
    return jsonify({"status": "pending"}), 200


@app.route('/tune_stop', methods=['POST'])
def tune_stop():
    db.set_state("tune_stop_pending", True)
    db.set_state("tune_stop_acknowledged", False)
    db.set_state("tune_in_progress", False)
    return jsonify({"status": "pending"}), 200


@app.route('/tune_status', methods=['GET'])
def tune_status():
    """Frontend polls this to update indicator."""
    return jsonify({
        "tuning_active": db.get_state("tune_in_progress", False),
        "tune_completed": db.get_state("tune_completed", False)
    })


# =========================================================
# ---------------- Relay Control (ESP32) -----------------
# =========================================================
@app.route('/relay', methods=['POST'])
def relay_control():
    try:
        req = request.get_json()
        target_state = req.get("on") # true or false
        if target_state is None:
            target_state = req.get("relay")
        
        if target_state is None:
             return jsonify({"error": "Missing 'on' or 'relay' field"}), 400

        # Update Desired State
        db.set_state("power_on", 1 if target_state else 0)

        # Send command to ESP32
        result = esp32_client.set_relay(target_state)
        
        if result and result.get("success"):
            # OPTIMIZATION: Update cache immediately on success
            db.set_state("esp32_connected", True)
            db.set_state("esp32_last_seen", time.time())
            db.set_state("relay_actual", target_state)
            return jsonify(result), 200
        else:
            return jsonify({"error": "ESP32 Unavailable"}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/relay_status', methods=['GET'])
def relay_status():
    """
    Return cached status from background polling service (relay_service.py).
    Decouples frontend latency from ESP32 network latency.
    """
    last_seen = db.get_state("esp32_last_seen", 0)
    now = time.time()
    age = now - last_seen
    
    connected = db.get_state("esp32_connected", False)
    
    # If data is too old (>15s), mark as offline/stale even if flag says connected
    if age > 15:
        connected = False
        
    return jsonify({
        "alive": connected,
        "relay": db.get_state("relay_actual") if connected else None, # Return null if stale
        "last_seen_s": float(f"{age:.1f}"), # seconds since last successful poll
        "desired": bool(db.get_state("power_on", 0))
    }), 200


# ---------------- Main ----------------
def main():
    app.run(host=config.FLASK_HOST, port=config.FLASK_PORT)


if __name__ == "__main__":
    main()
