#!/bin/bash

# Configuration
COMFY_DIR="/home/ai-cc/Documents/projects/ComfyUI"
PROJECT_DIR="/home/ai-cc/Documents/projects/CNY_photobooth"
CLOUDFLARE_URL="http://localhost:5001"
CONDA_PROFILE="/home/ai-cc/miniconda3/etc/profile.d/conda.sh"
TUNNEL_LOG="$PROJECT_DIR/tunnel.log"

export DEPLOY_MODE=remote

echo "=========================================="
echo "  DEPLOY MODE: REMOTE (dual-machine)"
echo "  Linux receiver + video generation"
echo "=========================================="
echo ""
echo "Starting CNY Photobooth System..."

# 1. Start ComfyUI Server
echo "Starting ComfyUI..."
gnome-terminal --title="ComfyUI Server" -- bash -c "export DEPLOY_MODE=remote; source '$CONDA_PROFILE'; conda activate comfyui; cd '$COMFY_DIR'; python main.py --enable-manager --listen; exec bash"

# 2. Start Linux Receiver (Flask App)
echo "Starting Linux Receiver..."
gnome-terminal --title="Linux Receiver" -- bash -c "export DEPLOY_MODE=remote; source '$CONDA_PROFILE'; conda activate comfyui; cd '$PROJECT_DIR/dgx_photobooth'; python linux_receiver.py; exec bash"

# 3. Start Cloudflare Tunnel
echo "Starting Cloudflare Tunnel..."
rm -f "$PROJECT_DIR/dgx_photobooth/tunnel.log"
gnome-terminal --title="Cloudflare Tunnel" -- bash -c "cd '$PROJECT_DIR/dgx_photobooth' && cloudflared tunnel --url $CLOUDFLARE_URL 2>&1 | tee tunnel.log; exec bash"

echo "All systems initiated in REMOTE mode."
echo "Tunnel log: $TUNNEL_LOG"
