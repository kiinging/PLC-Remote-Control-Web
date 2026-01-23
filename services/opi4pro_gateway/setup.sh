#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🐧 Updating system packages..."
sudo apt update && sudo apt upgrade -y

echo "📦 Installing system dependencies..."
sudo apt install -y \
  python3-venv \
  python3-dev \
  python3-pip \
  python3-setuptools \
  build-essential \
  git \
  swig \
  python3-spidev

echo "🐍 Creating virtual environment..."
cd "$SCRIPT_DIR"
python3 -m venv venv --system-site-packages
source venv/bin/activate

echo "⬆️ Upgrading pip..."
pip install --upgrade pip

echo "🔌 Installing wiringOP-Python from source (Orange Pi manual)..."
cd /tmp
rm -rf wiringOP-Python
git clone --recursive https://github.com/orangepi-xunlong/wiringOP-Python.git -b next
cd wiringOP-Python
git submodule update --init --remote

echo "  → Generating bindings.i (required step)..."
python3 generate-bindings.py > bindings.i

echo "  → Installing wiringpi..."
python3 setup.py install

echo "📦 Installing Python packages..."
cd "$SCRIPT_DIR"
pip install -r requirements.txt

echo "✅ Setup complete!"
echo ""
echo "👉 To use the virtual environment:"
echo "   source venv/bin/activate"
echo ""
echo "⚠️  GPIO operations (light control) require sudo:"
echo "   sudo python web_api.py"
echo "   sudo python test/test_blink.py"
