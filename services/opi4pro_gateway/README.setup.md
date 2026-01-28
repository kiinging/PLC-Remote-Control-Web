# Orange Pi 4 Pro Gateway Setup

This guide details how to set up the gateway services from a fresh OS installation.

## 1. System Requirements & Preparation
*   **Hardware**: Orange Pi 4 Pro.
*   **OS**: Orange Pi OS (Arch) or Armbian (Ubuntu Jammy recommended).
*   **Network**: Ethernet or robust WiFi connection.
*   **User**: Default user `orangepi`.

### Clone the Repository
```bash
cd /home/orangepi
git clone https://github.com/kiinging/PLC-Remote-Control-Web.git
cd PLC-Remote-Control-Web
```

## 2. Install Dependencies (Automated)
We use a setup script to install system packages, compile `wiringOP-Python`, and create the Python virtual environment.

```bash
cd services/opi4pro_gateway
chmod +x setup.sh
./setup.sh
```
*This may take 5-10 minutes as it compiles libraries from source.*

## 3. Deploy Services
The `setup.sh` script installs software but does not configure the system services. You must do this manually to ensure they run on boot.

### Copy Service Files
```bash
# Copy all 4 service definitions to the system folder
sudo cp gateway-api.service /etc/systemd/system/
sudo cp gateway-sensor.service /etc/systemd/system/
sudo cp gateway-relay.service /etc/systemd/system/
sudo cp gateway-modbus.service /etc/systemd/system/

# Reload systemd to recognize new files
sudo systemctl daemon-reload
```

## 4. Fix Permissions (CRITICAL)
This is the most important step. Without this, services will crash due to permission errors on the shared database and log files.

### Database Permissions
Allow all services (root and orangepi) to read/write the shared database.
```bash
# Create directory if it doesn't exist
sudo mkdir -p /var/lib/opi4pro_gateway

# Set ownership to orangepi group
sudo chown -R orangepi:orangepi /var/lib/opi4pro_gateway/

# Set read/write permissions for the group
sudo chmod -R 770 /var/lib/opi4pro_gateway/

# Set SGID bit (Crucial: New files inherit 'orangepi' group automatically)
sudo chmod g+s /var/lib/opi4pro_gateway/
```

### Log Directory Permissions
Ensure the `orangepi` user can write logs.
```bash
sudo chown -R orangepi:orangepi /home/orangepi/PLC-Remote-Control-Web/services/opi4pro_gateway/logs/
```

## 5. Enable and Start
```bash
# Enable services to run on boot
sudo systemctl enable gateway-api gateway-sensor gateway-relay gateway-modbus

# Start them now
sudo systemctl restart gateway-api gateway-sensor gateway-relay gateway-modbus
```

## 6. Verification
Check that all services are `active (running)`.

```bash
sudo systemctl status gateway-*
```

### Common Issues
*   **Modbus crashing?** Check logs: `sudo journalctl -u gateway-modbus -n 50`
*   **Database Locked?** Re-run the "Fix Permissions" steps above.
