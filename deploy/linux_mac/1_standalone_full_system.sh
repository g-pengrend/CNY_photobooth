#!/bin/bash
# ========================================================
# Standalone Full Linux Setup (Single Machine Mode)
# Runs ComfyUI Image (8188) + ComfyUI Video (8189) +
# Kiosk Frontend (5000) + Receiver (5001) + Cloudflare
# ========================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMFY_DIR="${COMFY_DIR:-$HOME/Documents/projects/ComfyUI}"
CLOUDFLARE_URL="http://localhost:5001"
CONDA_PROFILE="${CONDA_PROFILE:-$HOME/miniconda3/etc/profile.d/conda.sh}"
TUNNEL_LOG="$PROJECT_DIR/dgx_photobooth/tunnel.log"
SESSION="photobooth"

export DEPLOY_MODE=local

if [ -f "$CONDA_PROFILE" ]; then
    source "$CONDA_PROFILE"
    if ! conda info --envs | grep -q "comfy_spark"; then
        echo "Notice: Conda environment 'comfy_spark' not found. Trying comfyui..."
    fi
fi

cleanup() {
    echo ""
    echo "=========================================="
    echo "  CLEANING UP & RESETTING GPU TO DEFAULT"
    echo "=========================================="
    tmux kill-session -t $SESSION 2>/dev/null
    timeout 3s bash -c "echo quit | nvidia-cuda-mps-control 2>/dev/null"
    sudo pkill -9 nvidia-cuda-mps 2>/dev/null
    sudo rm -rf /tmp/nvidia-mps /tmp/nvidia-log
    sudo nvidia-smi -i 0 -c DEFAULT 2>/dev/null
    echo "Done. GPU is back in Shared Mode."
}
trap cleanup INT TERM

echo "=========================================="
echo "  DEPLOY MODE: FULL LINUX (Single Machine)"
echo "=========================================="

echo "Initializing NVIDIA MPS..."
echo quit | nvidia-cuda-mps-control 2>/dev/null
sudo pkill -9 nvidia-cuda-mps 2>/dev/null
sudo rm -rf /tmp/nvidia-mps /tmp/nvidia-log
mkdir -p /tmp/nvidia-mps /tmp/nvidia-log

export CUDA_MPS_PIPE_DIRECTORY=/tmp/nvidia-mps
export CUDA_MPS_LOG_DIRECTORY=/tmp/nvidia-log

nvidia-cuda-mps-control -d 2>/dev/null || true
COUNTER=0
while [ $COUNTER -lt 5 ]; do
  if ps aux | grep -v grep | grep -q "nvidia-cuda-mps-server"; then
    break
  fi
  python3 -c "import torch; torch.cuda.init()" 2>/dev/null || true
  sleep 1
  ((COUNTER++))
done

tmux kill-session -t $SESSION 2>/dev/null
tmux new-session -d -s $SESSION -n "Servers"

# Pane 0: ComfyUI Image (8188, Priority 0)
tmux select-pane -t $SESSION -T "ComfyUI Image (Port 8188)"
tmux send-keys -t $SESSION "export CUDA_MPS_PIPE_DIRECTORY=/tmp/nvidia-mps; export CUDA_MPS_CLIENT_PRIORITY=0; [ -f '$CONDA_PROFILE' ] && source '$CONDA_PROFILE' && conda activate comfy_spark 2>/dev/null || conda activate comfyui 2>/dev/null; cd '$COMFY_DIR' && python main.py --cuda-malloc --gpu-only --fp8_e4m3fn-unet --port 8188 --listen" C-m

# Pane 1: ComfyUI Video (8189, Priority 1)
tmux split-window -t $SESSION
tmux select-layout -t $SESSION tiled
tmux select-pane -t $SESSION -T "ComfyUI Video (Port 8189)"
tmux send-keys -t $SESSION "sleep 2; export CUDA_MPS_PIPE_DIRECTORY=/tmp/nvidia-mps; export CUDA_MPS_CLIENT_PRIORITY=1; [ -f '$CONDA_PROFILE' ] && source '$CONDA_PROFILE' && conda activate comfy_spark 2>/dev/null || conda activate comfyui 2>/dev/null; cd '$COMFY_DIR' && python main.py --cuda-malloc --gpu-only --port 8189 --listen" C-m

# Pane 2: Kiosk Frontend (5000)
tmux split-window -t $SESSION
tmux select-layout -t $SESSION tiled
tmux select-pane -t $SESSION -T "Kiosk Frontend (5000)"
tmux send-keys -t $SESSION "sleep 4; [ -f '$CONDA_PROFILE' ] && source '$CONDA_PROFILE' && conda activate comfy_spark 2>/dev/null || conda activate comfyui 2>/dev/null; cd '$PROJECT_DIR/kiosk_frontend' && python app.py" C-m

# Pane 3: Linux Receiver (5001)
tmux split-window -t $SESSION
tmux select-layout -t $SESSION tiled
tmux select-pane -t $SESSION -T "Receiver (5001)"
tmux send-keys -t $SESSION "sleep 5; [ -f '$CONDA_PROFILE' ] && source '$CONDA_PROFILE' && conda activate comfy_spark 2>/dev/null || conda activate comfyui 2>/dev/null; cd '$PROJECT_DIR/dgx_photobooth' && python linux_receiver.py" C-m

# Pane 4: Cloudflare Tunnel
tmux split-window -t $SESSION
tmux select-layout -t $SESSION tiled
tmux select-pane -t $SESSION -T "Cloudflare Tunnel"
tmux send-keys -t $SESSION "sleep 6; cd '$PROJECT_DIR/dgx_photobooth' && cloudflared tunnel --url $CLOUDFLARE_URL 2>&1 | tee tunnel.log" C-m

CTRL_SCRIPT="clear; echo '=========================================='; echo '  ALL PHOTOBOOTH SERVICES RUNNING!'; echo '=========================================='; echo '  To DETACH (leave running in background):'; echo '  Press: Ctrl+b, then d'; echo ''; echo '  To SHUT DOWN: Press Ctrl+C'; echo '=========================================='; trap 'tmux kill-session -t $SESSION' EXIT INT TERM; sleep 2147483647"
tmux split-window -t $SESSION "bash -c \"$CTRL_SCRIPT\""
tmux select-layout -t $SESSION tiled
tmux attach-session -t $SESSION
