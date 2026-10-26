#!/bin/bash
# ========================================================
# DGX Server Headless Daemon Launcher
# Starts ComfyUI 8188 + 8189 + Receiver 5001 + Frontend 5000
# Designed to run in the background on DGX A100.
# ========================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMFY_DIR="${COMFY_DIR:-$HOME/Documents/projects/ComfyUI}"
CONDA_PROFILE="${CONDA_PROFILE:-$HOME/miniconda3/etc/profile.d/conda.sh}"
SESSION="dgx_photobooth"

echo "========================================================"
echo "  STARTING HEADLESS DGX PHOTOBOOTH CLUSTER STACK"
echo "========================================================"
echo "  • ComfyUI Image Server   : Port 8188 (Priority 0)"
echo "  • ComfyUI Video Server   : Port 8189 (Priority 1)"
echo "  • Receiver Orchestrator  : Port 5001"
echo "  • Frontend Web App/Studio: Port 5000"
echo "========================================================"

# Reset MPS
echo "Initializing MPS..."
sudo pkill -9 nvidia-cuda-mps 2>/dev/null
sudo rm -rf /tmp/nvidia-mps /tmp/nvidia-log
mkdir -p /tmp/nvidia-mps /tmp/nvidia-log
export CUDA_MPS_PIPE_DIRECTORY=/tmp/nvidia-mps
export CUDA_MPS_LOG_DIRECTORY=/tmp/nvidia-log
nvidia-cuda-mps-control -d 2>/dev/null || true

tmux kill-session -t $SESSION 2>/dev/null
tmux new-session -d -s $SESSION -n "DGX_Services"

# 1. ComfyUI Image (8188)
tmux send-keys -t $SESSION:0 "export CUDA_MPS_PIPE_DIRECTORY=/tmp/nvidia-mps; export CUDA_MPS_CLIENT_PRIORITY=0; [ -f '$CONDA_PROFILE' ] && source '$CONDA_PROFILE' && conda activate comfy_spark 2>/dev/null || conda activate comfyui 2>/dev/null; cd '$COMFY_DIR' && python main.py --cuda-malloc --gpu-only --fp8_e4m3fn-unet --port 8188 --listen 0.0.0.0" C-m

# 2. ComfyUI Video (8189)
tmux split-window -t $SESSION:0
tmux send-keys -t $SESSION:0.1 "sleep 3; export CUDA_MPS_PIPE_DIRECTORY=/tmp/nvidia-mps; export CUDA_MPS_CLIENT_PRIORITY=1; [ -f '$CONDA_PROFILE' ] && source '$CONDA_PROFILE' && conda activate comfy_spark 2>/dev/null || conda activate comfyui 2>/dev/null; cd '$COMFY_DIR' && python main.py --cuda-malloc --gpu-only --port 8189 --listen 0.0.0.0" C-m

# 3. Receiver (5001)
tmux split-window -t $SESSION:0
tmux send-keys -t $SESSION:0.2 "sleep 5; [ -f '$CONDA_PROFILE' ] && source '$CONDA_PROFILE' && conda activate comfy_spark 2>/dev/null || conda activate comfyui 2>/dev/null; cd '$PROJECT_DIR/dgx_photobooth' && python linux_receiver.py" C-m

# 4. Frontend Web App / Studio (5000)
tmux split-window -t $SESSION:0
tmux send-keys -t $SESSION:0.3 "sleep 6; [ -f '$CONDA_PROFILE' ] && source '$CONDA_PROFILE' && conda activate comfy_spark 2>/dev/null || conda activate comfyui 2>/dev/null; cd '$PROJECT_DIR/kiosk_frontend' && python app.py" C-m

echo "✅ All DGX Services started in background tmux session: '$SESSION'"
echo "   View logs with : tmux attach -t $SESSION"
echo "   Detach cleanly : Press Ctrl+b, then d"
