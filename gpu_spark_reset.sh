#!/bin/bash
echo "Performing Emergency Blackwell Reset..."

# Kill all potential GPU users
tmux kill-session -t photobooth 2>/dev/null
pkill -9 python
pkill -9 cloudflared

# Shutdown MPS
echo quit | nvidia-cuda-mps-control 2>/dev/null
sudo pkill -9 nvidia-cuda-mps
sudo rm -rf /tmp/nvidia-mps /tmp/nvidia-log

# Reset Hardware
sudo nvidia-smi -i 0 -c DEFAULT

echo "------------------------------------------"
echo "GPU is now in DEFAULT mode."
echo "Verify with: nvidia-smi"
echo "------------------------------------------"
