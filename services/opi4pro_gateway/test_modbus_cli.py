import argparse
import sys
import time
import os
import json

# Add parent directory to path to import database/config
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import db

def monitor_loop():
    print("Monitoring Gateway State (Ctrl+C to stop)...")
    print(f"{'Time':<10} | {'Synced':<6} | {'Seq':<5} | {'Mode':<5} | {'SP':<6} | {'PV':<6} | {'MV':<6}")
    print("-" * 70)
    
    last_seq = -1
    
    while True:
        try:
            # Read all relevant state
            synced = db.get_state("modbus_plc_synced", False)
            gw_seq = db.get_state("gw_tx_seq", 0)
            mode = db.get_state("mode", 0)
            sp = db.get_state("setpoint", 0.0)
            pv = db.get_state("rtd_temp", 0.0)
            mv = db.get_state("mv", 0.0) # Feedback MV
            
            # Format
            t_str = time.strftime("%H:%M:%S")
            sync_str = "YES" if synced else "NO"
            
            print(f"{t_str:<10} | {sync_str:<6} | {gw_seq:<5} | {mode:<5} | {sp:<6.1f} | {pv:<6.1f} | {mv:<6.1f}", end='\r')
            
            time.sleep(0.5)
        except KeyboardInterrupt:
            print("\nStopped.")
            break
        except Exception as e:
            print(f"\nError: {e}")
            time.sleep(1)

def set_value(args):
    updates = {}
    
    if args.setpoint is not None:
        updates["setpoint"] = args.setpoint
        print(f"Setting Setpoint -> {args.setpoint}")
        
    if args.mode is not None:
        updates["mode"] = args.mode
        print(f"Setting Mode -> {args.mode}")

    if args.manual_mv is not None:
        updates["mv_manual"] = args.manual_mv
        print(f"Setting Manual MV -> {args.manual_mv}")
        
    if args.tune is not None:
        updates["tune_status"] = args.tune
        print(f"Setting Tune Status -> {args.tune}")

    if not updates:
        print("No values to set. Use arguments like --setpoint 50.0")
        return

    # Apply updates
    for k, v in updates.items():
        db.set_state(k, v)
    
    print("Values updated in Database. Modbus Service should pick them up shortly.")

def main():
    parser = argparse.ArgumentParser(description="Modbus Gateway Tester")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")
    
    # Monitor command
    subparsers.add_parser("monitor", help="Monitor DB state")
    
    # Set command
    set_parser = subparsers.add_parser("set", help="Set DB values")
    set_parser.add_argument("--setpoint", type=float, help="Target Setpoint")
    set_parser.add_argument("--mode", type=int, help="Control Mode (0=Man, 1=Auto, 2=Tune)")
    set_parser.add_argument("--manual-mv", type=float, help="Manual MV %")
    set_parser.add_argument("--tune", type=int, choices=[0, 1], help="Tune Command (0=Stop, 1=Start)")

    args = parser.parse_args()
    
    if args.command == "monitor":
        monitor_loop()
    elif args.command == "set":
        set_value(args)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
