#!/bin/bash
# ========================================================
# Photobooth Edge Print Agent (macOS & Linux)
# Connects to hosted domain or Tailscale server and prints
# directly to USB photo printer via native CUPS lp.
# ========================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$DIR"

echo "========================================================"
echo "  PHOTOBOOTH EDGE PRINT AGENT (macOS / Linux)"
echo "  Listens to remote photobooth server and dispatches"
echo "  directly to physical photo printer with zero popups."
echo "========================================================"
echo ""

CACHE_FILE=".print_server_address"
DEFAULT_URL="http://100.67.79.127:5000"
if [ -f "$CACHE_FILE" ]; then
    DEFAULT_URL=$(cat "$CACHE_FILE")
fi

read -p "Enter Server URL [default: $DEFAULT_URL]: " USER_URL
SERVER_URL="${USER_URL:-$DEFAULT_URL}"
echo "$SERVER_URL" > "$CACHE_FILE"

echo ""
echo "Connecting Print Agent to: $SERVER_URL"
python3 print_agent.py --server "$SERVER_URL"
