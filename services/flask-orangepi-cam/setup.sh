#!/bin/bash
set -e

echo "📦 Updating system..."
sudo apt update -y
sudo apt upgrade -y

echo "📦 Installing core dependencies for Flask + Picamera2..."
sudo apt install -y \
    python3-picamera2 --no-install-recommends

echo "🧰 Setting up Python virtual environment (with system packages)..."
python3 -m venv --system-site-packages venv
source venv/bin/activate

pip install --upgrade pip setuptools wheel

echo "🐍 Installing Python packages..."
pip install flask gunicorn

echo "🧹 Cleaning up..."
sudo apt autoremove -y
sudo apt clean

echo "✅ Setup complete! To start the app:"
echo "source venv/bin/activate"
