# service_web.py
from flask import Flask, jsonify, request, send_from_directory
from database import db
import time
import os
import esp32_client
import config
import wiringpi
import threading
import requests

# ---------------- Boot-safe defaults (once per OS boot) ----------------
def apply_boot_defaults(db):
    """
    Apply safe defaults once per OS boot (not every service restart).
    """
    try:
        boot_id = open("/proc/sys/kernel/random/boot_id").read().strip()
    except Exception:
        boot_id = None

    last_boot = db.get_state("boot_id", None)
    if boot_id and last_boot == boot_id:
        return  # already applied this boot

    db.set_state("boot_id", boot_id or str(time.time()))

    # --- SAFE DEFAULTS ---
    db.set_state("light", 0)
    db.set_state("web", 0)
    db.set_state("mode", 0)          # 0 = manual
    db.set_state("tune_status", 0)
    db.set_state("tune_done", False)
    db.set_state("mv_manual", 0.0)   # optional safety

app = Flask(__name__)

# Apply defaults once per boot (prevents “last saved Tune/Web/Light” problem)
apply_boot_defaults(db)

# Initialize defaults in DB if missing (only for keys you don't force on boot)
if db.get_state("plc_status") is None:
    db.set_state("plc_status", 0)

# ---------------- GPIO Setup ----------------
# Using wiringpi for Orange Pi 4 Pro GPIO control
# wPi pin mapping: Physical pin 18 (PL2) maps to wPi pin 10
# wPi pin mapping: Physical pin 18 (PL2) maps to wPi pin 10
try:
    wiringpi.wiringPiSetup()
    wiringpi.pinMode(config.LIGHT_PIN, wiringpi.OUTPUT)

    # ✅ Sync hardware to DB state (instead of forcing OFF blindly)
    wiringpi.digitalWrite(config.LIGHT_PIN, 1 if db.get_state("light", 0) else 0)

    GPIO_AVAILABLE = True
except Exception as e:
    print(f"Wait, no root? GPIO failed: {e}")
    GPIO_AVAILABLE = False



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
        sensor_ok = sensor_age_sec <= 5.0  # 2s sampling, 5s is reasonable threshold
    
    # Modbus health check
    modbus_last_tick_ts = db.get_state("modbus_last_tick_ts")
    modbus_age_sec = None
    modbus_ok = False
    
    if modbus_last_tick_ts is not None:
        modbus_age_sec = current_time - modbus_last_tick_ts
        modbus_ok = modbus_age_sec <= 5.0  # 1s loop, 5s is reasonable threshold
    
    return jsonify({
        "status": "alive",
        "timestamp": current_time,
        "light": db.get_state("light", 0),
        "plc": db.get_state("plc_status", 0),
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
    return jsonify({"web": 1, "status": "pending"}), 200

@app.route('/web/off', methods=['POST'])
def web_stop():
    db.set_state("web", 0)
    return jsonify({"web": 0, "status": "pending"}), 200

@app.route('/web_ack', methods=['GET'])
def web_ack_status():
    """Return whether the latest Web Control update has been acknowledged by PLC."""
    try:
        acknowledged = db.get_state("modbus_plc_synced", False)
        return jsonify({"acknowledged": acknowledged}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/plc/on', methods=['POST'])
def plc_on():
    db.set_state("plc_status", 1)
    return jsonify({"plc": 1}), 200


@app.route('/plc/off', methods=['POST'])
def plc_off():
    db.set_state("plc_status", 0)
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
    # Check PLC Heartbeat
    plc_last = db.get_state("modbus_plc_last_seen", 0)
    plc_alive = (time.time() - plc_last) < config.PLC_HEARTBEAT_TIMEOUT
    
    # Only report Synced if PLC is actually Alive
    is_synced = plc_alive and db.get_state("modbus_plc_synced", False)

    return jsonify({
        "light": db.get_state("light"),
        "plc": db.get_state("plc_status"),
        # Use acknowledged state for Web, but fallback to 0 if missing.
        "web": 1 if is_synced and db.get_state("web", 0) == 1 else 0,
        "web_ack": is_synced, # ✅ Derived from Sync Status
        "mv_ack": is_synced, # ✅ Derived from Sync Status
        "plc_ack": is_synced, # ✅ Derived from Sync Status
        "mv": db.get_state("mv", 0.0), # ✅ Real MV from PLC (HR22-23)
        "mode": db.get_state("mode"),
        "web_desired": db.get_state("web", 0), # For debug/advanced UI
        "plc_alive": plc_alive, # ✅ PLC Heartbeat Status
        "plc_last_seen": plc_last
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
    Receive setpoint from browser → save to shared_data.
    Modbus service detects change and updates sequence.
    """
    try:
        req = request.get_json()
        sp = float(req.get("setpoint"))

        if sp > 80:
            sp = 80  # clamp max 80°C

        # Update shared memory
        db.set_state("setpoint", sp)
        
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
        acknowledged = db.get_state("modbus_plc_synced", False)
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

        # Save MV
        db.set_state("mv_manual", mv_value)

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
        acknowledged = db.get_state("modbus_plc_synced", False)
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
        acknowledged = db.get_state("modbus_plc_synced", False)
        return jsonify({"acknowledged": acknowledged}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ---------------- Tune Setpoint Control ----------------
# ---------------- Tune Setpoint (HR18–HR19 + HR24 flag) ----------------
# Keeping this logic for Setpoint updates during tuning if needed, 
# but usually it shares the main setpoint logic. 
# Modifying per user request to use simplified simplified tuning hooks if any.
@app.route('/tune_setpoint', methods=['POST'])
def tune_setpoint():
    try:
        req = request.get_json()
        tune_sp = float(req.get("tune_setpoint"))

        if tune_sp > 80: tune_sp = 80
        if tune_sp < 0: tune_sp = 0

        # Updated: Write to main setpoint key
        db.set_state("setpoint", tune_sp)

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
        acknowledged = db.get_state("modbus_plc_synced", False)
        return jsonify({"acknowledged": acknowledged}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/tune_start', methods=['POST'])
def tune_start():
    """Tell PLC to begin tuning."""
    db.set_state("tune_status", 1)  # 1 = Start Tuning
    db.set_state("tune_done", False) # Clear done flag
    return jsonify({"status": "pending"}), 200


@app.route('/tune_stop', methods=['POST'])
def tune_stop():
    db.set_state("tune_status", 0) # 0 = Stop Tuning
    return jsonify({"status": "pending"}), 200


@app.route('/tune_status', methods=['GET'])
def tune_status_route():
    """Frontend polls this to update indicator."""
    return jsonify({
        "tuning_active": db.get_state("tune_status", 0) == 1,
        "tune_completed": db.get_state("tune_done", False)
    })


# =========================================================
# ---------------- Relay Control (ESP32) -----------------
# =========================================================

def soft_shutdown_sequence():
    """
    Orchestrate soft shutdown of Radxa before cutting power.
    """
    radxa_url = f"http://{config.RADXA_IP}:{config.RADXA_PORT}"
    
    # 1. Send Shutdown Command
    try:
        print(f"🛑 Sending shutdown command to Radxa at {radxa_url}...")
        requests.post(f"{radxa_url}/shutdown", timeout=2)
    except Exception as e:
        print(f"⚠️ Failed to send shutdown command (Radxa might already be down): {e}")

    # 2. Polling for 'Death' (Wait for it to go offline)
    # Give it up to 30 seconds to shut down.
    print("⏳ Waiting for Radxa to go offline...")
    start_wait = time.time()
    is_down = False
    
    while (time.time() - start_wait) < 45.0:
        try:
            # Check health endpoint
            resp = requests.get(f"{radxa_url}/health", timeout=1)
            if resp.status_code == 200:
                # Still alive
                pass
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
            # Connection failed -> likely down!
            print("✅ Radxa appears to be DOWN (Connection Refused/Timeout).")
            is_down = True
            break
            
        time.sleep(2.0)
        
    if not is_down:
        print("⚠️ Timeout waiting for Radxa shutdown. Proceeding to cut power anyway.")

    # 3. Final Safety Delay (allow OS to sync disks after network goes down)
    time.sleep(5.0)

    # 4. Cut Power (ESP32 Relay OFF)
    print("🔌 Cutting Power to Radxa (ESP32 Relay OFF)...")
    try:
        # Update DB State to OFF so relay_service doesn't fight us
        db.set_state("relay_desired", 0)
        
        esp32_client.set_relay(False)
        db.set_state("relay_actual", False) # Assume success for UI responsiveness
    except Exception as e:
        print(f"❌ Failed to cut power: {e}")

@app.route('/relay', methods=['POST'])
def relay_control():
    try:
        req = request.get_json()
        target_state = req.get("on") # true or false
        if target_state is None:
            target_state = req.get("relay")
        
        if target_state is None:
             return jsonify({"error": "Missing 'on' or 'relay' field"}), 400

        # Logic Branch:
        # IF Turning OFF -> Start Soft Shutdown Sequence (Background)
        # IF Turning ON -> Immediate Action
        
        if target_state is False:
             # Soft Shutdown
             print("Initiating Soft Shutdown Sequence...")
             threading.Thread(target=soft_shutdown_sequence, daemon=True).start()
             
             # Return "Pending" status to UI - keep relay=1 until it actually turns off?
             # Or let UI think it's off but hardware lags. 
             # Better: The user asked for OFF, so we acknowledge OFF request, 
             # but the actual power cut happens later.
             # We set 'relay_desired' to 0 in later stage? 
             # Use a special transient state?
             # Simple approach: Acknowledge logic receipt. 
             # Don't update 'relay_desired' yet to prevent `relay_service.py` from cutting power immediately!
             
             return jsonify({
                 "status": "shutdown_initiated",
                 "message": "Soft shutdown started. Power will cut in ~30s.",
                 "relay": 1 # Report ON for now so UI doesn't look broken if it checks status
             }), 200

        else:
            # Immediate Turn ON
            # Update Desired State
            db.set_state("relay_desired", 1)

            # Send command to ESP32
            result = esp32_client.set_relay(True)
            
            if result and result.get("success"):
                # OPTIMIZATION: Update cache immediately on success
                db.set_state("esp32_connected", True)
                db.set_state("esp32_last_seen", time.time())
                db.set_state("relay_actual", True)
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
        "desired": bool(db.get_state("relay_desired", 0))
    }), 200


# ---------------- Main ----------------
def main():
    app.run(host=config.FLASK_HOST, port=config.FLASK_PORT)


if __name__ == "__main__":
    main()
