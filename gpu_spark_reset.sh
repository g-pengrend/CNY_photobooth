#!/bin/bash
echo "Performing Emergency Blackwell Reset..."

# Kill all potential GPU users
tmux kill-session -t photobooth 2>/dev/null
pkill -9 python
pkill -9 cloudflared

# Shutdown MPS
# Use timeout to prevent hanging if the daemon is totally locked
timeout 3s bash -c "echo quit | nvidia-cuda-mps-control 2>/dev/null"
echo "Note: You may be prompted for your password to kill the GPU daemon."
sudo pkill -9 nvidia-cuda-mps
sudo rm -rf /tmp/nvidia-mps /tmp/nvidia-log

# Reset Hardware
sudo nvidia-smi -i 0 -c DEFAULT

echo "------------------------------------------"
echo "GPU is now in DEFAULT mode."
echo "Verify with: nvidia-smi"
echo "------------------------------------------"
