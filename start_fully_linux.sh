#!/bin/bash

# Configuration
COMFY_DIR="/home/ai-cc/Documents/projects/ComfyUI"
PROJECT_DIR="/home/ai-cc/Documents/projects/CNY_photobooth"
CLOUDFLARE_URL="http://localhost:5001"
CONDA_PROFILE="/home/ai-cc/miniconda3/etc/profile.d/conda.sh"
TUNNEL_LOG="$PROJECT_DIR/dgx_photobooth/tunnel.log"

export DEPLOY_MODE=local

echo "=========================================="
echo "  DEPLOY MODE: FULL LINUX (single-machine)"
echo "  Running everything on Linux with MPS"
echo "=========================================="
echo ""

# 1. Setup NVIDIA MPS
echo "Setting up NVIDIA MPS..."
# Check if GPU is already in Exclusive_Process mode
if ! nvidia-smi -i 0 -q -d COMPUTE | grep -qi "Exclusive_Process"; then
    echo "GPU is not in EXCLUSIVE_PROCESS mode. Prompting for sudo..."
    sudo nvidia-smi -i 0 -c EXCLUSIVE_PROCESS
else
    echo "GPU is already in EXCLUSIVE_PROCESS mode."
fi

# Set the directories for the communication pipes
export CUDA_MPS_PIPE_DIRECTORY=/tmp/nvidia-mps
export CUDA_MPS_LOG_DIRECTORY=/tmp/nvidia-log

# Quit any existing daemon and remove old pipe files to avoid conflicts
echo quit | nvidia-cuda-mps-control 2>/dev/null
rm -rf $CUDA_MPS_PIPE_DIRECTORY $CUDA_MPS_LOG_DIRECTORY
mkdir -p $CUDA_MPS_PIPE_DIRECTORY $CUDA_MPS_LOG_DIRECTORY

# Launch the daemon as your local user
nvidia-cuda-mps-control -d || echo "Failed to start MPS daemon."
echo ""

echo "Starting CNY Photobooth System..."

# Remove old tunnel log before starting
rm -f "$TUNNEL_LOG"

echo "Launching services in a tmux multiplexer..."

SESSION="photobooth"

# Kill any existing session with the same name
tmux kill-session -t $SESSION 2>/dev/null

# Create a new detached session
tmux new-session -d -s $SESSION -n "Servers"

# Pane 1 (Bottom/Left): ComfyUI Image
tmux send-keys -t $SESSION "export DEPLOY_MODE=local; export CUDA_MPS_PIPE_DIRECTORY=/tmp/nvidia-mps; export CUDA_MPS_CLIENT_PRIORITY=0; source '$CONDA_PROFILE'; conda activate comfy_spark; cd '$COMFY_DIR'; python main.py --cuda-malloc --disable-mmap --disable-pinned-memory --gpu-only --fp8_e4m3fn-unet --fp8_e4m3fn-text-enc --supports-fp8-compute --fast fp8_matrix_mult cublas_ops --reserve-vram 1.0 --port 8188" C-m

# Pane 2: ComfyUI Video
tmux split-window -h -t $SESSION
tmux send-keys -t $SESSION "sleep 2; export DEPLOY_MODE=local; export CUDA_MPS_PIPE_DIRECTORY=/tmp/nvidia-mps; export CUDA_MPS_CLIENT_PRIORITY=1; source '$CONDA_PROFILE'; conda activate comfy_spark; cd '$COMFY_DIR'; python main.py --cuda-malloc --disable-mmap --disable-pinned-memory --gpu-only --reserve-vram 1.0 --fp8_e4m3fn-unet --fp8_e4m3fn-text-enc --supports-fp8-compute --fast fp8_matrix_mult cublas_ops --port 8189" C-m

# Pane 3: Kiosk Frontend
tmux select-pane -t 0
tmux split-window -v -t $SESSION
tmux send-keys -t $SESSION "sleep 4; export DEPLOY_MODE=local; source '$CONDA_PROFILE'; conda activate comfy_spark; cd '$PROJECT_DIR/kiosk_frontend'; python app.py" C-m

# Pane 4: Linux Receiver
tmux select-pane -t 1
tmux split-window -v -t $SESSION
tmux send-keys -t $SESSION "sleep 6; export DEPLOY_MODE=local; source '$CONDA_PROFILE'; conda activate comfy_spark; cd '$PROJECT_DIR/dgx_photobooth'; python linux_receiver.py" C-m

# Pane 5: Cloudflare Tunnel
tmux split-window -v -t $SESSION
tmux send-keys -t $SESSION "sleep 8; cd '$PROJECT_DIR/dgx_photobooth' && cloudflared tunnel --url $CLOUDFLARE_URL 2>&1 | tee tunnel.log" C-m

# Enable mouse support and run layout
tmux select-layout -t $SESSION tiled
tmux set-option -t $SESSION mouse on

# Open gnome-terminal and attach to tmux
gnome-terminal --title="CNY Photobooth Backend (tmux)" -- bash -c "tmux attach-session -t $SESSION"

# sleep 4
# echo "Opening Browser..."
# xdg-open "http://localhost:5000"

echo "All servers started in FULL LINUX mode!"
echo "Tunnel log: $TUNNEL_LOG"
