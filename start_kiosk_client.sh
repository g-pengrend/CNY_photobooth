#!/bin/bash

echo ========================================================
echo   CNY Photobooth - Kiosk Client Mode (Hybrid Unix)
echo   This PC will run:
echo     - Kiosk Frontend (port 5000)
echo     - Local Receiver (port 5001) for local printing
echo     - Cloudflare Tunnel (for mobile QR codes)
echo
echo   All ComfyUI processing will run on the remote machine.
echo ========================================================
echo

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE_FILE="$SCRIPT_DIR/.receiver_address"
DEFAULT_HOST="breadnbiscuit"

# Read cached address if exists
if [ -f "$CACHE_FILE" ]; then
    CACHED_VAL=$(cat "$CACHE_FILE" | xargs)
    if [ ! -z "$CACHED_VAL" ]; then
        DEFAULT_HOST="$CACHED_VAL"
    fi
fi

echo "The current configured remote backend host is: $DEFAULT_HOST"
echo "To use a different host or IP (e.g. Tailscale IP), type it below."
echo "Otherwise, press ENTER to keep [$DEFAULT_HOST]."
echo
read -p "Remote Host/IP: " USER_INPUT

if [ ! -z "$USER_INPUT" ]; then
    REMOTE_HOST="$USER_INPUT"
else
    REMOTE_HOST="$DEFAULT_HOST"
fi

# Save to cache
echo "$REMOTE_HOST" > "$CACHE_FILE"

echo
echo ========================================================
echo   Connecting Kiosk to Remote Backend: $REMOTE_HOST
echo   Make sure Tailscale is connected and remote backend is running!
echo ========================================================
echo

export DEPLOY_MODE=hybrid
export RECEIVER_IP="$REMOTE_HOST"

# Try activating conda environments if available
if [ -f "$HOME/miniconda3/etc/profile.d/conda.sh" ]; then
    source "$HOME/miniconda3/etc/profile.d/conda.sh"
    conda activate comfyui 2>/dev/null || conda activate comfy_spark 2>/dev/null || true
elif [ -f "$HOME/anaconda3/etc/profile.d/conda.sh" ]; then
    source "$HOME/anaconda3/etc/profile.d/conda.sh"
    conda activate comfyui 2>/dev/null || conda activate comfy_spark 2>/dev/null || true
fi

# Detect python vs python3 (common on macOS)
PYTHON_CMD="python"
if ! command -v python &> /dev/null && command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
fi

echo "1. Starting Frontend server (port 5000)..."
cd "$SCRIPT_DIR/kiosk_frontend"
$PYTHON_CMD app.py &
FRONTEND_PID=$!

sleep 2

echo "2. Starting Local Receiver (port 5001)..."
cd "$SCRIPT_DIR/dgx_photobooth"
$PYTHON_CMD linux_receiver.py &
RECEIVER_PID=$!

sleep 2

echo "3. Starting Cloudflare Tunnel..."
rm -f "$SCRIPT_DIR/dgx_photobooth/tunnel.log"
if command -v cloudflared &> /dev/null; then
    cloudflared tunnel --url http://localhost:5001 > "$SCRIPT_DIR/dgx_photobooth/tunnel.log" 2>&1 &
    TUNNEL_PID=$!
else
    echo "⚠️  Warning: cloudflared command not found. Cloudflare tunnel not started."
    TUNNEL_PID=""
fi

sleep 3
echo "Opening Kiosk Browser (http://localhost:5000)..."
if command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:5000 &
elif command -v open &> /dev/null; then
    open http://localhost:5000 &
fi

echo "======================================================="
echo "  CNY Photobooth Client is running!"
echo "  - Kiosk Frontend: http://localhost:5000"
echo "  - Gallery & Printing: http://localhost:5001"
echo "======================================================="
echo "Press Ctrl+C to stop all servers."

# Trap Ctrl+C to clean up all background processes
cleanup() {
    echo "Stopping all processes..."
    kill $FRONTEND_PID 2>/dev/null
    kill $RECEIVER_PID 2>/dev/null
    if [ ! -z "$TUNNEL_PID" ]; then
        kill $TUNNEL_PID 2>/dev/null
    fi
    exit 0
}
trap cleanup INT TERM

# Wait for the main processes
wait $FRONTEND_PID $RECEIVER_PID
