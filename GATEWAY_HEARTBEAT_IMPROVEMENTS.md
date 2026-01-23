# Gateway Heartbeat Improvements

## Overview
Enhanced the gateway heartbeat to detect when "API is alive but sensors/modbus are dead" by adding health status timestamps and age calculations.

## Changes Made

### 1. **temp_reading.py**
- Added `data["last_update_ts"] = time.time()` alongside the existing string timestamp
- Now tracks both human-readable and Unix timestamp versions of sensor updates
- Allows heartbeat to calculate age of sensor data

### 2. **modbus_server.py**
- Added `shared_data.data["modbus_last_tick_ts"] = time.time()` at the start of `update_modbus_registers()` loop
- Tracks the last time the modbus loop executed (every 1 second)
- Allows heartbeat to detect if modbus thread is stuck

### 3. **web_api.py - Enhanced /heartbeat Endpoint**
Updated response to include:
- `last_update` (string) - human-readable timestamp from sensor
- `sensor_age_sec` (float or null) - seconds since last sensor reading
- `sensor_ok` (bool) - True if `sensor_age_sec <= 5`, False otherwise
- `modbus_age_sec` (float or null) - seconds since last modbus loop tick
- `modbus_ok` (bool) - True if `modbus_age_sec <= 5`, False otherwise

Backward compatibility maintained:
- All existing fields (`status`, `timestamp`, `light`, `plc`, `mode`) remain unchanged

### 4. **shared_data.py**
- Initialized `data["last_update_ts"] = None`
- Initialized `data["modbus_last_tick_ts"] = None`

## Health Check Logic

**Thresholds**: 5 seconds (reasonable for 2s sensor sampling + 1s modbus loop)

| Status | sensor_ok | modbus_ok | Meaning |
|--------|-----------|-----------|---------|
| ✅ Healthy | True | True | All systems running normally |
| ⚠️ Sensor Stalled | False | True | API & modbus alive, but sensor loop hung/crashed |
| ⚠️ Modbus Stalled | True | False | API & sensors alive, but modbus loop hung/crashed |
| 🔴 Critical | False | False | Multiple subsystems down |
| 🔴 API Dead | No response | - | Network connectivity issue |

## Testing

### Quick Test Command
```bash
curl http://localhost:5000/heartbeat | jq
```

### Example Healthy Response
```json
{
  "status": "alive",
  "timestamp": 1674432000.1234,
  "light": 0,
  "plc": 0,
  "mode": 0,
  "last_update": "2025-01-23 14:00:00",
  "sensor_age_sec": 1.5,
  "sensor_ok": true,
  "modbus_age_sec": 0.3,
  "modbus_ok": true
}
```

### Example with Stalled Sensor
```json
{
  "status": "alive",
  "timestamp": 1674432010.5678,
  "light": 0,
  "plc": 0,
  "mode": 0,
  "last_update": "2025-01-23 14:00:00",
  "sensor_age_sec": 42.8,
  "sensor_ok": false,
  "modbus_age_sec": 0.2,
  "modbus_ok": true
}
```

### Continuous Monitoring (1s interval)
```bash
watch -n 1 'curl -s http://localhost:5000/heartbeat | jq .'
```

## Notes
- All imports (`time`) were already present in respective files
- No new dependencies required
- Timestamp precision: Unix timestamps (float, seconds)
- Age calculations done client-side in the heartbeat endpoint
- Thresholds can be tuned based on deployment needs (modify the `<= 5` condition)
