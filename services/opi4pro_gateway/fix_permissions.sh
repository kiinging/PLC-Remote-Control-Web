#!/bin/bash
set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")" # Assuming script is in services/opi4pro_gateway

echo "🔧 Fixing permissions for project..."
echo "   Target: $PROJECT_ROOT"

# Change ownership of the entire project directory to the current user (orangepi)
# We assume the current user is the one running this script (without sudo, or we get SUDO_USER)
TARGET_USER="${SUDO_USER:-$USER}"
TARGET_GROUP="${SUDO_USER:-$USER}"

if [ "$TARGET_USER" == "root" ]; then
    echo "⚠️  Running as root directly? defaulting to 'orangepi' user if exists."
    if id "orangepi" &>/dev/null; then
        TARGET_USER="orangepi"
        TARGET_GROUP="orangepi"
    fi
fi

echo "   User: $TARGET_USER"
echo "   Group: $TARGET_GROUP"

sudo chown -R "$TARGET_USER:$TARGET_GROUP" "$PROJECT_ROOT"

# Ensure the database file specifically is writable
DB_FILE="$SCRIPT_DIR/gateway.db"
if [ -f "$DB_FILE" ]; then
    echo "   Fixing database permissions: $DB_FILE"
    sudo chmod 664 "$DB_FILE"
    sudo chown "$TARGET_USER:$TARGET_GROUP" "$DB_FILE"
    # Also fix WAL files if they exist
    sudo chown "$TARGET_USER:$TARGET_GROUP" "$DB_FILE"* 2>/dev/null || true
fi

echo "🔄 Restarting gateway services..."
sudo systemctl restart gateway-*

echo "✅ Done! Permissions fixed and services restarted."
