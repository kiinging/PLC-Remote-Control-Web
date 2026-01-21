#!/bin/bash
set -e

echo "🐧 Updating system packages..."
sudo apt update && sudo apt upgrade -y

echo "📦 Installing system dependencies..."
sudo apt install -y \
  python3-venv \
  python3-dev \
  python3-pip \
  build-essential \
  git \
  libgpiod-dev \
  python3-spidev

echo "🐍 Creating virtual environment..."
python3 -m venv venv --system-site-packages
source venv/bin/activate

echo "⬆️ Upgrading pip..."
pip install --upgrade pip

echo "📦 Installing Python packages..."
pip install -r requirements.txt

echo "✅ Setup complete!"
echo "👉 To start using the virtual environment, run: source venv/bin/activate"


