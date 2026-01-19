# 📷 Raspberry Pi Zero 2 W Security Camera (Flask + Picamera2)

This project turns a Raspberry Pi Zero 2 W into a **lightweight real-time security camera**, streaming video over your local network or securely over the internet with **Cloudflare Tunnel**.

### ✨ Features

* **Live MJPEG video streaming** in a browser
* **Timestamp overlay** on each frame
* **Low CPU & RAM usage** (optimized for Pi Zero 2 W)
* **Auto-start on boot** via `systemd`
* **Optional secure public access** via Cloudflare Tunnel (no port forwarding needed)

---

## ⚙️ Headless Setup Reference

If you're setting up your Raspberry Pi Zero 2 W **headlessly** (without a monitor or keyboard),
you can follow this excellent community guide:

> **Guide:** [Raspberry Pi Zero 2 W – Headless Setup (with Static IP) and Pi-hole by @axelhamil](https://gist.github.com/axelhamil/b3787d4cd9e23d228fdd40ee150be4c1)

It walks through creating a bootable SD card with Wi-Fi and SSH preconfigured using **Raspberry Pi Imager**.

---

### ⚠️ Important: Use a 2.4 GHz Wi-Fi Network
- When configuring Wi-Fi in Raspberry Pi Imager, make sure the SSID corresponds to your **2.4 GHz** band.

## 🧩 Tested Environment

| Component | Version / Info |
|------------|----------------|
| **Hardware** | Raspberry Pi Zero 2 W |
| **Operating System** | Raspberry Pi OS Lite (64-bit) |
| **Base Distribution** | Debian 13 “Trixie” (server version) |
| **Kernel Architecture** | aarch64 |
| **Python** | 3.11+ (default on Trixie) |
| **Camera Stack** | `libcamera` + `picamera2` (APT preinstalled) |

> 💡 *Note:* Trixie replaces Bookworm as the current stable base for Raspberry Pi OS (released Oct 2025).  
> This project has been verified to work on the **64-bit Lite (headless)** image.


---

## 📚 Reference

* Official Picamera2 docs: [🔗 Raspberry Pi GitHub](https://github.com/raspberrypi/picamera2)

---

# 🚀 PART 1: Local Camera Setup

### 1️⃣ Clone the repository

```bash
git clone https://github.com/kiinging/flask-pi-cam-cloudflare.git
cd flask-pi-cam-cloudflare
```

### 2️⃣ Run the setup script

This will:

* Install system packages
* Create a Python virtual environment (PEP 668 compliant)
* Install all dependencies inside the venv

```bash
chmod +x setup.sh
./setup.sh
```
---

### 🧪 Test locally

**Test camera only:**

```bash
source venv/bin/activate
python cam_test.py
```

**Run the Flask app manually:**

```bash
source venv/bin/activate
python app.py
```

**Or faster with Gunicorn:**

```bash
source venv/bin/activate
gunicorn -b 0.0.0.0:5000 app:app --threads 2
```

Then open your browser to:

```
http://<pi-ip>:5000
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

### 2️⃣ Test temporary tunnel

```bash
cloudflared tunnel --url http://localhost:5000
```

You’ll get a temporary `.trycloudflare.com` link.
(This closes when you stop the command.)

---

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
cloudflared tunnel create pi-camera
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
cloudflared tunnel route dns pi-camera cam.plc-web.online
```

5. **Start the tunnel**:

```bash
cloudflared tunnel run pi-camera
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


