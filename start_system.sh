#!/bin/bash

# Configuration
COMFY_DIR="/home/ai-cc/Documents/projects/ComfyUI"
PROJECT_DIR="/home/ai-cc/Documents/projects/CNY_photobooth"
CLOUDFLARE_URL="http://localhost:5001"
CONDA_PROFILE="/home/ai-cc/miniconda3/etc/profile.d/conda.sh"

echo "🚀 Starting CNY Photobooth System..."

# 1. Start ComfyUI Server
echo "Starting ComfyUI..."
gnome-terminal --title="ComfyUI Server" -- bash -c "source '$CONDA_PROFILE'; conda activate comfyui; cd '$COMFY_DIR'; python main.py --enable-manager; exec bash"

# 2. Start Linux Receiver (Flask App)
echo "Starting Linux Receiver..."
gnome-terminal --title="Linux Receiver" -- bash -c "source '$CONDA_PROFILE'; conda activate comfyui; cd '$PROJECT_DIR'; python linux_receiver.py; exec bash"

# 3. Start Cloudflare Tunnel
echo "Starting Cloudflare Tunnel..."
rm -f tunnel.log # Clear old log
gnome-terminal --title="Cloudflare Tunnel" -- bash -c "cloudflared tunnel --url $CLOUDFLARE_URL 2>&1 | tee tunnel.log; exec bash"

echo "✅ All systems initiated in separate terminals."
