#!/bin/bash
set -e

echo "=========================================================="
echo "  🚀 Starting SEIT Photobooth DGX Backend Services"
echo "=========================================================="

COMFY_DIR="${COMFY_DIR:-/app/ComfyUI}"
PROJECT_DIR="${PROJECT_DIR:-/app}"

# 1. ComfyUI Image Pipeline (Port 8188)
echo "Starting ComfyUI Image Server (Port 8188)..."
python3 "${COMFY_DIR}/main.py" \
    --cuda-malloc \
    --gpu-only \
    --fp8_e4m3fn-unet \
    --port 8188 \
    --listen 0.0.0.0 &
PID_COMFY_IMAGE=$!

# 2. ComfyUI Video Pipeline (Port 8189)
echo "Starting ComfyUI Video Server (Port 8189)..."
python3 "${COMFY_DIR}/main.py" \
    --cuda-malloc \
    --gpu-only \
    --port 8189 \
    --listen 0.0.0.0 &
PID_COMFY_VIDEO=$!

sleep 4

# 3. Receiver API (Port 5001)
echo "Starting Photobooth Receiver API (Port 5001)..."
python3 "${PROJECT_DIR}/dgx_photobooth/linux_receiver.py" &
PID_RECEIVER=$!

sleep 2

# 4. Frontend Web App & Theme Studio (Port 5000)
echo "Starting Photobooth Frontend (Port 5000)..."
python3 "${PROJECT_DIR}/kiosk_frontend/app.py" &
PID_FRONTEND=$!

echo "=========================================================="
echo "  ✅ All 4 Photobooth Services are Live and Running!"
echo "     • Frontend & Theme Studio : http://0.0.0.0:5000"
echo "     • Receiver API            : http://0.0.0.0:5001"
echo "     • ComfyUI Image (VTON)    : http://0.0.0.0:8188"
echo "     • ComfyUI Video (Motion)  : http://0.0.0.0:8189"
echo "=========================================================="

# Trap termination signals to stop all background processes cleanly
cleanup() {
    echo "Stopping all services..."
    kill -TERM "$PID_FRONTEND" "$PID_RECEIVER" "$PID_COMFY_IMAGE" "$PID_COMFY_VIDEO" 2>/dev/null
    wait
    exit 0
}
trap cleanup SIGINT SIGTERM

wait
