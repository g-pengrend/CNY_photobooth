#!/bin/bash
# ========================================================
# Emergency GPU & NVIDIA MPS Daemon Reset
# ========================================================
echo "Performing Emergency GPU / MPS Reset..."

# Kill lingering sessions
tmux kill-session -t photobooth 2>/dev/null
tmux kill-session -t dgx_photobooth 2>/dev/null
pkill -9 -f "ComfyUI/main.py" 2>/dev/null
pkill -9 -f "linux_receiver.py" 2>/dev/null

# Shutdown MPS
timeout 3s bash -c "echo quit | nvidia-cuda-mps-control 2>/dev/null"
sudo pkill -9 nvidia-cuda-mps 2>/dev/null
sudo rm -rf /tmp/nvidia-mps /tmp/nvidia-log

# Reset Hardware
sudo nvidia-smi -i 0 -c DEFAULT 2>/dev/null

echo "------------------------------------------"
echo "GPU is now reset to DEFAULT shared mode."
echo "Verify with: nvidia-smi"
echo "------------------------------------------"
