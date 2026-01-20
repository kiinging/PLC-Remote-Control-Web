#!/bin/bash
set -e

echo "🧩 Radxa Camera Stream Setup"
echo "============================"

# Detect board
BOARD="Radxa ZERO 3"
echo "📟 Detected board: $BOARD"

# Update package list
echo "🔧 Updating package lists..."
sudo apt update

# Upgrade system safely
echo "⚙️  Upgrading system packages..."
sudo apt full-upgrade -y --allow-change-held-packages || echo "⚠️  Skipped downgrades."

# Install essential dependencies including those for OpenCV
echo "📦 Installing core dependencies..."
# libgl1 is often needed for opencv-python-headless even if headless
sudo apt install -y python3 python3-venv python3-pip v4l-utils ffmpeg libgl1

# Install Cloudflared
if ! command -v cloudflared &> /dev/null; then
  echo "☁️  Installing Cloudflared..."
  if [ -f "cloudflared-linux-arm64.deb" ]; then
    sudo apt install -y ./cloudflared-linux-arm64.deb
  else
    echo "⚠️  cloudflared-linux-arm64.deb not found trying apt..."
    sudo apt install -y cloudflared || echo "❌ Failed to install cloudflared"
  fi
else
  echo "✅ Cloudflared already installed"
fi

# Create virtual environment
echo "🐍 Creating Python virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
if [ -f "requirements.txt" ]; then
  echo "📜 Installing Python packages..."
  pip install --upgrade pip
  pip install -r requirements.txt
else
  echo "⚠️  No requirements.txt found!"
fi

echo "✅ Setup complete!"
echo "To start manually: source venv/bin/activate && python3 app.py"
echo "To check service: sudo systemctl status camera_app"
