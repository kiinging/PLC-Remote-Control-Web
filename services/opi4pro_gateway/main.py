# main.py
from multiprocessing import Process
from temp_reading import main as sensor_main
from web_api import app
from relay_service import main as relay_main
from modbus_server import main as modbus_main  # ⬅️ DISABLED: pymodbus version incompatibility

import time
import logging
import signal
import sys

# Configure Logging for Main Process
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [PROCESS_MGR] - %(levelname)s - %(message)s'
)
logger = logging.getLogger("main")

def run_flask():
    print("🚀 Starting Flask server...")
    app.run(host="0.0.0.0", port=5000)

class ProcessManager:
    def __init__(self):
        self.processes = {}
        self.running = True

    def start_process(self, name, target, args=()):
        p = Process(target=target, args=args, name=name)
        p.start()
        self.processes[name] = {"process": p, "target": target, "args": args}
        logger.info(f"✅ Started {name} (PID: {p.pid})")

    def monitor(self):
        while self.running:
            for name, info in list(self.processes.items()):
                p = info["process"]
                if not p.is_alive():
                    logger.warning(f"⚠️ Process {name} (PID: {p.pid}) crashed! Restarting...")
                    self.start_process(name, info["target"], info["args"])
            
            time.sleep(1)

    def stop_all(self):
        self.running = False
        logger.info("🛑 Stopping all processes...")
        for name, info in self.processes.items():
            p = info["process"]
            if p.is_alive():
                p.terminate()
                p.join(timeout=2)
                if p.is_alive():
                    p.kill()
        logger.info("👋 All processes stopped.")

if __name__ == "__main__":
    manager = ProcessManager()

    # Handle Ctrl+C
    def signal_handler(sig, frame):
        logger.info(f"Received signal {sig}. Should perform graceful shutdown...")
        manager.stop_all()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    logger.info("🔁 Starting Gateway Services...")
    
    manager.start_process("SensorService", sensor_main)
    manager.start_process("FlaskServer", run_flask)
    manager.start_process("RelayService", relay_main)
    manager.start_process("ModbusServer", modbus_main)

    try:
        manager.monitor()
    except KeyboardInterrupt:
        manager.stop_all()
