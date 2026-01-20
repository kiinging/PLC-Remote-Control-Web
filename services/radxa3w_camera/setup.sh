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
# python3-full is recommended for venv on newer Debian/Raspbian
sudo apt install -y python3 python3-full python3-pip v4l-utils ffmpeg libgl1

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
# Remove existing venv to prevent symlink errors
rm -rf venv
python3 -m venv venv

# Install Python dependencies using explicit path to avoid "source" issues
if [ -f "requirements.txt" ]; then
  echo "📜 Installing Python packages..."
  ./venv/bin/pip install --upgrade pip
  ./venv/bin/pip install -r requirements.txt
else
  echo "⚠️  No requirements.txt found!"
fi

echo "✅ Setup complete!"
echo "To copy the service file:"
echo "sudo cp camera_app.service /etc/systemd/system/"
echo "sudo systemctl daemon-reload"
echo "sudo systemctl enable --now camera_app"
