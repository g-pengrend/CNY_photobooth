#!/bin/bash

# Configuration
COMFY_DIR="/home/ai-cc/Documents/projects/ComfyUI"
PROJECT_DIR="/home/ai-cc/Documents/projects/CNY_photobooth"
CLOUDFLARE_URL="http://localhost:5001"
CONDA_PROFILE="/home/ai-cc/miniconda3/etc/profile.d/conda.sh"
TUNNEL_LOG="$PROJECT_DIR/dgx_photobooth/tunnel.log"
SESSION="photobooth"

export DEPLOY_MODE=local

# --- CONDA ENVIRONMENT CHECK ---
if [ -f "$CONDA_PROFILE" ]; then
    source "$CONDA_PROFILE"
    if ! conda info --envs | grep -q "comfy_spark"; then
        echo "ERROR: Conda environment 'comfy_spark' not found."
        echo "Please create it or update the environment name in the script."
        exit 1
    fi
else
    echo "ERROR: Conda profile not found at $CONDA_PROFILE"
    exit 1
fi


# --- AUTOMATIC RESET ON EXIT ---
# This function runs if the script is interrupted or finishes
cleanup() {
    echo ""
    echo "=========================================="
    echo "  CLEANING UP & RESETTING GPU TO DEFAULT"
    echo "=========================================="
    tmux kill-session -t $SESSION 2>/dev/null
    
    # Use timeout to prevent hanging if the daemon is unresponsive
    timeout 3s bash -c "echo quit | nvidia-cuda-mps-control 2>/dev/null"
    
    echo "Note: You may be prompted for your password to kill the GPU daemon."
    sudo pkill -9 nvidia-cuda-mps
    sudo rm -rf /tmp/nvidia-mps /tmp/nvidia-log
    sudo nvidia-smi -i 0 -c DEFAULT
    echo "Done. GPU is back in Shared Mode."
}
# Trap signals if script is aborted during startup
trap cleanup INT TERM

echo "=========================================="
echo "  DEPLOY MODE: FULL LINUX (Blackwell Optimized)"
echo "=========================================="

# 1. Setup NVIDIA MPS
echo "Initializing NVIDIA MPS..."
echo quit | nvidia-cuda-mps-control 2>/dev/null
sudo pkill -9 nvidia-cuda-mps

# Reset paths and ensure local user ownership
sudo rm -rf /tmp/nvidia-mps /tmp/nvidia-log
mkdir -p /tmp/nvidia-mps /tmp/nvidia-log
# No sudo needed for mkdir if we just cleaned it, but let's be safe
sudo chown -R $USER:$USER /tmp/nvidia-mps /tmp/nvidia-log

sudo nvidia-smi -i 0 -c DEFAULT

export CUDA_MPS_PIPE_DIRECTORY=/tmp/nvidia-mps
export CUDA_MPS_LOG_DIRECTORY=/tmp/nvidia-log
nvidia-cuda-mps-control -d

echo "Waking up Blackwell GB10 Handshake..."
# Ensure conda environment is active for the main script
conda activate comfy_spark
if [ "$CONDA_DEFAULT_ENV" != "comfy_spark" ]; then
    echo "ERROR: Failed to activate conda environment 'comfy_spark'."
    exit 1
fi

COUNTER=0
until ps aux | grep -v grep | grep -q "nvidia-cuda-mps-server" || [ $COUNTER -eq 15 ]; do
  echo "Waiting for Blackwell handshake... ($((COUNTER*2))s)"
  # Force the server to spawn by poking the GPU
  python -c "import torch; torch.cuda.init()" 2>/dev/null || true
  sleep 2
  ((COUNTER++))
done

if ! ps aux | grep -v grep | grep -q "nvidia-cuda-mps-server"; then
  echo "ERROR: Blackwell handshake failed. Check nvidia-smi."
  exit 1
fi

echo "GPU Handshake Successful. Launching TMUX..."

# --- TMUX SETUP ---
tmux kill-session -t $SESSION 2>/dev/null
tmux new-session -d -s $SESSION -n "Servers"

# Pane 0: ComfyUI Image (Priority 0)
tmux select-pane -t $SESSION -T "ComfyUI Image (Port 8188)"
tmux send-keys -t $SESSION "export CUDA_MPS_PIPE_DIRECTORY=/tmp/nvidia-mps; export CUDA_MPS_CLIENT_PRIORITY=0; source '$CONDA_PROFILE'; conda activate comfy_spark; cd '$COMFY_DIR'; python main.py --cuda-malloc --gpu-only --fp8_e4m3fn-unet --port 8188 --listen" C-m

# Pane 1: ComfyUI Video (Priority 1)
tmux split-window -t $SESSION
tmux select-layout -t $SESSION tiled
tmux select-pane -t $SESSION -T "ComfyUI Video (Port 8189)"
tmux send-keys -t $SESSION "sleep 2; export CUDA_MPS_PIPE_DIRECTORY=/tmp/nvidia-mps; export CUDA_MPS_CLIENT_PRIORITY=1; source '$CONDA_PROFILE'; conda activate comfy_spark; cd '$COMFY_DIR'; python main.py --cuda-malloc --gpu-only --port 8189 --listen" C-m

# Pane 2: Kiosk
tmux split-window -t $SESSION
tmux select-layout -t $SESSION tiled
tmux select-pane -t $SESSION -T "Kiosk Frontend"
tmux send-keys -t $SESSION "sleep 4; source '$CONDA_PROFILE'; conda activate comfy_spark; cd '$PROJECT_DIR/kiosk_frontend'; python app.py" C-m

# Pane 3: Linux Receiver
tmux split-window -t $SESSION
tmux select-layout -t $SESSION tiled
tmux select-pane -t $SESSION -T "Kiosk Photobooth"
tmux send-keys -t $SESSION "sleep 6; source '$CONDA_PROFILE'; conda activate comfy_spark; cd '$PROJECT_DIR/dgx_photobooth'; python linux_receiver.py" C-m

# Pane 4: Cloudflare Tunnel
tmux split-window -t $SESSION
tmux select-layout -t $SESSION tiled
tmux select-pane -t $SESSION -T "Cloudflare Tunnel"
tmux send-keys -t $SESSION "sleep 8; cd '$PROJECT_DIR/dgx_photobooth' && cloudflared tunnel --url $CLOUDFLARE_URL 2>&1 | tee tunnel.log" C-m

# Pane 5: Control Pane
CTRL_SCRIPT="clear; echo '=========================================='; echo '  ALL SERVERS STARTED AND RUNNING!'; echo '=========================================='; echo '  To DETACH (leave running in background):'; echo '  Press: Ctrl+b, then d'; echo ''; echo '  To SHUT DOWN the system:'; echo '  Press: Ctrl+C'; echo '=========================================='; trap 'tmux kill-session -t $SESSION' EXIT INT TERM; sleep 2147483647"
tmux split-window -t $SESSION "bash -c \"$CTRL_SCRIPT\""
tmux select-layout -t $SESSION tiled
tmux select-pane -t $SESSION -T "System Control"

tmux select-layout -t $SESSION tiled
tmux set-option -t $SESSION mouse on
tmux set-option -t $SESSION pane-border-status top

# Attach to the session
tmux attach-session -t $SESSION

# When we reach here, tmux is either detached or killed.
if ! tmux has-session -t $SESSION 2>/dev/null; then
    # Session was killed (user pressed Ctrl+C in Control Window)
    cleanup
else
    # Session still exists, user just detached
    echo ""
    echo "=========================================="
    echo "  TMUX DETACHED - RUNNING IN BACKGROUND"
    echo "=========================================="
    echo "  To re-attach:  tmux attach -t $SESSION"
    echo "  To shut down:  ./gpu_spark_reset.sh"
    echo "=========================================="
fi
