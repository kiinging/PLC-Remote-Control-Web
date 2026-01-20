# 🎥 Radxa Zero 3 — OV5647 MIPI-CSI Camera Setup

This document explains how the **OV5647 camera sensor** connects through the **MIPI-CSI interface** and **Rockchip ISP** on the Radxa Zero 3, and how to verify that the kernel driver and device tree are correctly configured.

---

## Clone the REAL repository

### 1. Clone the REAL repository
git clone https://github.com/kiinging/PLC-Remote-Control-Web.git repo
### 2. Create a link so your service still finds the code at "~/radxa3w_camera"
ln -s ~/repo/services/radxa3w_camera ~/radxa3w_camera
### 3. Now go in and setup (this uses the NEW setup.sh I just fixed)
cd ~/radxa3w_camera
chmod +x setup.sh
./setup.sh

### For further update:
cd ~/repo
### Discard local changes and force match the server
git reset --hard origin/main
### Now pull just to be sure (it should say up to date)
git pull


## ✅ OV5647 Driver Build Status (Kernel Config Note)

When checking the kernel configuration with:

```bash
zcat /proc/config.gz | grep OV5647
```

The output is:

```
CONFIG_VIDEO_OV5647=y
```

### 💡 What This Means

* The **OV5647 camera driver is built directly into the kernel**.
* The `=y` flag means it’s **statically compiled** — not as a loadable module (`.ko` file).
* Therefore:

  * You **won’t see** the driver in `lsmod`.
  * You **cannot** load it manually with `modprobe ov5647`.
  * The driver is **always active at boot**, and it will automatically probe the hardware if the **device tree** defines a compatible node, for example:

    ```dts
    compatible = "ovti,ov5647";
    ```

If the Device Tree Overlay (DTBO) for your camera is missing or misconfigured, the kernel will still contain the OV5647 driver — but the sensor will not appear in `/dev` or `media-ctl`.

---
Step 1: Verify Camera (Build Confidence)
Run this on your Radxa to confirm the camera app is listening and accepting the password:

curl -I -u radxa:radxa http://localhost:5000/video_feed
If it says HTTP/1.1 200 OK, the camera is perfect. 🎉

## 🔧 Overview of the Camera Data Path

On the Radxa Zero 3 (RK3566), the MIPI-CSI camera pipeline flows through these stages:

```
[ OV5647 Sensor ]
        │  (MIPI CSI-2 signals + I²C control)
        ▼
[ Rockchip CSI-2 DPHY ]   → converts MIPI lanes into parallel pixel data
        ▼
[ RKISP (Rockchip Image Signal Processor) ]  → performs image processing
        ▼
[ /dev/videoX nodes (V4L2 interface) ]
```

---

## 🧪 Debugging Steps

### 1️⃣ Check if the OV5647 node exists in the live device tree

```bash
sudo grep -a -i ov5647 /sys/firmware/devicetree/base -R
```

---
## 🛠 Auto-start with systemd

We use a virtual environment to avoid conflicts between apt-managed and pip-installed packages.

### 3️⃣ Install the systemd service

```bash
sudo cp camera_app.service /etc/systemd/system/
```

### 4️⃣ Reload systemd, enable & start the service

```bash
sudo systemctl daemon-reload
sudo systemctl enable camera_app
sudo systemctl start camera_app
```

### 5️⃣ Check status

```bash
sudo systemctl status camera_app
```

---
### 🛑 To stop your background camera service (for diagnosis)

```bash
sudo systemctl stop camera_app
```

That immediately stops the Gunicorn process that’s streaming video.

---


# 🌍 PART 2: Cloudflare Tunnel (Secure Remote Access)

Cloudflare Tunnel lets you securely access your Pi camera from anywhere without exposing your home network.

---

### 1️⃣ Install cloudflared

```bash
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
sudo apt install ./cloudflared-linux-arm64.deb
```

### 3️⃣ Create a permanent tunnel

1. **Log in to Cloudflare**:

```bash
cloudflared login
```

Open the URL, select your domain, and authorize.
Pi will store the cert at:

```
/home/pizza/.cloudflared/cert.pem
```

2. **Create the tunnel**:

```bash
cloudflared tunnel create radxa3w-camera
```

3. **Create tunnel config**:

```bash
nano /home/pizza/.cloudflared/config.yml
```

```yaml
tunnel: 09457b11-3125-47e2-bd6b-8cc7a67d37de
credentials-file: /home/pizza/.cloudflared/09457b11-3125-47e2-bd6b-8cc7a67d37de.json

ingress:
  - hostname: cam.plc-web.online
    service: http://localhost:5000
  - service: http_status:404
```

4. **Route the hostname**:

```bash
cloudflared tunnel route dns radxa3w-camera cam.plc-web.online
```

5. **Start the tunnel**:

```bash
cloudflared tunnel run radxa3w-camera
```

Your camera is now live at:

```
https://cam.plc-web.online
```

---

# 🔄 PART 3: Auto-start Cloudflare Tunnel on Boot

Create a systemd service for Cloudflare:

```bash
sudo cp cloudflared.service /etc/systemd/system/
```


Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

Now both your camera app **and** Cloudflare Tunnel start automatically when you power on your Pi.

You can reboot the Pi with:
```bash
sudo reboot
```
---

## ⚡ Tips

* Keep your Pi updated: `sudo apt update && sudo apt upgrade -y`
* Check tunnel logs: `journalctl -u cloudflared -f`
* Check camera logs: `journalctl -u camera_app -f`

---


