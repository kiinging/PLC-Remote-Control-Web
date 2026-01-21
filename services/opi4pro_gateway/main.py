# main.py
from multiprocessing import Process
from temp_reading import main as sensor_main
from web_api import app
from modbus_server import main as modbus_main  # ⬅️ Add this line

def run_flask():
    print("🚀 Starting Flask server...")
    app.run(host="0.0.0.0", port=5000)

if __name__ == "__main__":
    print("🔁 Starting sensor and Flask processes...")
    p1 = Process(target=sensor_main)
    p2 = Process(target=run_flask)
    p3 = Process(target=modbus_main)  

    p1.start()
    p2.start()
    p3.start()

    p1.join()
    p2.join()
    p3.join()
