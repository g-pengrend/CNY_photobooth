#!/bin/bash
# ========================================================
# Kiosk Client (macOS & Linux - Tailscale / Remote Mode)
# Runs the local Kiosk Frontend & Local Receiver for USB printing
# while connecting to the remote DGX backend over Tailscale.
# ========================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR"

if [ "$(uname)" = "Darwin" ]; then
    FRONTEND_PORT="${FRONTEND_PORT:-5005}"
else
    FRONTEND_PORT="${FRONTEND_PORT:-5000}"
fi

echo "========================================================"
echo "  CNY PHOTOBOOTH - KIOSK CLIENT (macOS / Linux)"
echo "  This machine runs:"
echo "    - Kiosk Frontend (port $FRONTEND_PORT)"
echo "    - Local Receiver (port 5001) for direct local USB printing"
echo "    - Cloudflare Tunnel (for mobile QR codes)"
echo ""
echo "  All ComfyUI processing executes on the remote DGX."
echo "========================================================"
echo ""

CACHE_FILE="$PROJECT_DIR/.receiver_address"
DEFAULT_HOST="breadnbiscuit"

if [ -f "$CACHE_FILE" ]; then
    CACHED_VAL=$(cat "$CACHE_FILE" | xargs)
    if [ ! -z "$CACHED_VAL" ]; then
        DEFAULT_HOST="$CACHED_VAL"
    fi
fi

echo "Configured remote backend host: [$DEFAULT_HOST]"
read -p "Press ENTER to keep [$DEFAULT_HOST], or enter new Host/IP: " USER_INPUT
REMOTE_HOST="${USER_INPUT:-$DEFAULT_HOST}"
echo "$REMOTE_HOST" > "$CACHE_FILE"

export DEPLOY_MODE=hybrid
export RECEIVER_IP="$REMOTE_HOST"

cleanup() {
    echo ""
    echo "Stopping client processes..."
    kill "$PID_FRONTEND" "$PID_RECEIVER" "$PID_TUNNEL" 2>/dev/null
    exit 0
}
trap cleanup INT TERM

echo "Starting Local Receiver (5001)..."
cd "$PROJECT_DIR/dgx_photobooth"
python3 linux_receiver.py &
PID_RECEIVER=$!
sleep 2

echo "Starting Frontend ($FRONTEND_PORT)..."
cd "$PROJECT_DIR/kiosk_frontend"
PORT=$FRONTEND_PORT python3 app.py &
PID_FRONTEND=$!
sleep 2

echo "Starting Cloudflare Tunnel..."
cd "$PROJECT_DIR/dgx_photobooth"
cloudflared tunnel --url http://localhost:5001 > tunnel.log 2>&1 &
PID_TUNNEL=$!

echo ""
echo "========================================================"
echo "  Kiosk Client is Live!"
echo "  Open browser to: http://localhost:$FRONTEND_PORT"
echo "  Press Ctrl+C to stop client."
echo "========================================================"

wait
