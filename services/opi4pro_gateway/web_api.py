# This allows the Cloudflare Worker to:
# Control the light
# Read temperatures from shared memory

# web_api.py
from flask import Flask, jsonify, request
import OPi.GPIO as GPIO
from shared_data import data

app = Flask(__name__)

# ---------------- GPIO Setup ----------------
LIGHT_PIN = "PC14"
GPIO.setmode(GPIO.SUNXI)
GPIO.setup(LIGHT_PIN, GPIO.OUT)

# --- Initial state: ensure OFF --------------
GPIO.output(LIGHT_PIN, GPIO.LOW)
data["light"] = 0  #
data["plc"] = 0  # plc always OFF at boot

# =========================================================
# ---------------- Light / Web / PLC Control --------------
# =========================================================
@app.route('/light/on', methods=['POST'])
def turn_light_on():
    GPIO.output(LIGHT_PIN, GPIO.HIGH)
    data["light"] = 1
    return jsonify({"light": data["light"]}), 200

@app.route('/light/off', methods=['POST'])
def turn_light_off():
    GPIO.output(LIGHT_PIN, GPIO.LOW)
    data["light"] = 0
    return jsonify({"light": data["light"]}), 200

@app.route('/web/on', methods=['POST'])
def web_start():
    data["web"] = 1
    return jsonify({"web": data["web"]}), 200

@app.route('/web/off', methods=['POST'])
def web_stop():
    data["web"] = 0
    return jsonify({"web": data["web"]}), 200

@app.route('/plc/on', methods=['POST'])
def plc_on():
    data["plc"] = 1
    return jsonify({"plc": data["plc"]}), 200

@app.route('/plc/off', methods=['POST'])
def plc_off():
    data["plc"] = 0
    return jsonify({"plc": data["plc"]}), 200

# =========================================================
# ---------------- Mode Control ---------------------------
# =========================================================
@app.route('/mode/manual', methods=['POST'])
def mode_manual():
    data["mode"] = 0
    return jsonify({"mode": data["mode"]}), 200

@app.route('/mode/auto', methods=['POST'])
def mode_auto():
    data["mode"] = 1
    return jsonify({"mode": data["mode"]}), 200

@app.route('/mode/tune', methods=['POST'])
def mode_tune():
    data["mode"] = 2
    return jsonify({"mode": data["mode"]}), 200

# =========================================================
# ---------------- Control + Temperature Status -----------
# =========================================================
# ---------------- Control Status ------------
@app.route('/control_status', methods=['GET'])
def get_control_status():
    return jsonify({
        "light": data.get("light"),
        "plc": data.get("plc"),
        "web": data.get("web"),
        "mode": data.get("mode")
    })


# ---------------- Temperature Status ----------------
@app.route('/temp', methods=['GET'])
def get_temperature():
    """Return both temperatures + control states"""
    return jsonify({
        "rtd_temp": data.get("rtd_temp"),
        "last_update": data.get("last_update"),
        # "light": data.get("light"),
        # "plc": data.get("plc"),
    })

# ---------------- Trend Buffer ----------------
@app.route('/trend', methods=['GET'])
def get_trend_data():
    # return last 450 records (e.g., time=450 Samples * (2 sec/Sample) = 900 sec = 15 min)
    trend_data = list(data["trend"])[-450:]
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
        data["setpoint"] = sp
        data["setpoint_update_pending"] = True
        data["setpoint_acknowledged"] = False

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
        acknowledged = data.get("setpoint_acknowledged", False)
        return jsonify({"acknowledged": acknowledged}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/setpoint_status', methods=['GET'])
def get_setpoint():
    return jsonify({"setpoint": data.get("setpoint", 0.0)})

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
        data["mv_manual"] = mv_value
        data["mv_manual_update_pending"] = True
        data["mv_manual_acknowledged"] = False

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
        acknowledged = data.get("mv_manual_acknowledged", False)
        return jsonify({"acknowledged": acknowledged}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/mv_manual_status', methods=['GET'])
def get_mv_manual_status():
    return jsonify({"mv_manual": data.get("mv_manual", 0)})

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
        data["pid_pb"] = pb
        data["pid_ti"] = ti
        data["pid_td"] = td

        # mark update flags for Modbus loop
        data["pid_update_pending"] = True  # return to False when it send to modbus
        data["pid_acknowledged"] = False

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
        "pb": data.get("pid_pb", 1.0),
        "ti": data.get("pid_ti", 10.0),
        "td": data.get("pid_td", 0.0)
    })
    
@app.route('/pid_ack', methods=['GET'])
def pid_status():
    """Return whether the latest PID update has been acknowledged by PLC."""
    try:
        acknowledged = data.get("pid_acknowledged", False)
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

        data["tune_setpoint"] = tune_sp              # reuse same SP variable
        data["tune_setpoint_update_pending"] = True  # reset to False when HR written
        data["tune_setpoint_acknowledged"] = False   # reset to True when PLC resets HR24

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
        acknowledged = data.get("tune_setpoint_acknowledged", False)
        return jsonify({"acknowledged": acknowledged}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/tune_start', methods=['POST'])
def tune_start():
    """Tell PLC to begin tuning."""
    data["tune_start_pending"] = True           # reset to False when HR written
    data["tune_start_acknowledged"] = False     # reset to True when PLC resets HR23
    data["tune_in_progress"] = True
    data["tune_completed"] = False
    return jsonify({"status": "pending"}), 200


@app.route('/tune_stop', methods=['POST'])
def tune_stop():
    data["tune_stop_pending"] = True
    data["tune_stop_acknowledged"] = False
    data["tune_in_progress"] = False
    return jsonify({"status": "pending"}), 200


@app.route('/tune_status', methods=['GET'])
def tune_status():
    """Frontend polls this to update indicator."""
    return jsonify({
        "tuning_active": data.get("tune_in_progress", False),
        "tune_completed": data.get("tune_completed", False)
    })


# ---------------- Main ----------------
def main():
    app.run(host="0.0.0.0", port=5000)


if __name__ == "__main__":
    main()
