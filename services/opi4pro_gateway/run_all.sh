#!/bin/bash

#run_all.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting Flask server from: $SCRIPT_DIR"

# Activate virtual environment
source "$SCRIPT_DIR/venv/bin/activate"

echo "Virtual environment activated"

# Run Flask app using venv's Python as root
echo "Starting main.py..."
"$SCRIPT_DIR/venv/bin/python" "$SCRIPT_DIR/main.py"
