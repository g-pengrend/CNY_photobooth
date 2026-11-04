#!/bin/bash
set -e

echo "=========================================================="
echo "  🚀 Starting SEIT Photobooth DGX Backend Services"
echo "=========================================================="

COMFY_DIR="${COMFY_DIR:-/app/ComfyUI}"
PROJECT_DIR="${PROJECT_DIR:-/app}"

# 1. Initialize & auto-populate ComfyUI Model Mirror Directory Structure
echo "Ensuring ComfyUI model subdirectories exist in mounted storage..."
mkdir -p "${COMFY_DIR}/models/"{checkpoints,loras,vae,clip,unet,controlnet,insightface,facerestore_models,upscale_models,embeddings} 2>/dev/null || true

# Wire InsightFace model path so libraries find inswapper_128 & antelopev2
mkdir -p /root/.insightface
ln -sfn "${COMFY_DIR}/models/insightface" /root/.insightface/models

# 2. Dynamic Custom Nodes Mirror: Link any external custom nodes from host
if [ -d "${COMFY_DIR}/custom_nodes_external" ] && [ "$(ls -A ${COMFY_DIR}/custom_nodes_external 2>/dev/null)" ]; then
    echo "Linking external custom nodes from host mount..."
    for node in ${COMFY_DIR}/custom_nodes_external/*; do
        if [ -d "$node" ]; then
            nodename=$(basename "$node")
            ln -sfn "$node" "${COMFY_DIR}/custom_nodes/$nodename"
            echo " -> Linked custom node: $nodename"
        fi
    done
fi

# 3. GPU Device Assignment (100% Automatic Detection by default)
# - If 2+ GPUs are detected: GPU 0 -> Image (8188), GPU 1 -> Video (8189)
# - If 1 GPU is detected:   Both pipelines automatically run on GPU 0
# - Can be manually overridden via GPU_IMAGE_DEVICE / GPU_VIDEO_DEVICE env vars
if command -v nvidia-smi &> /dev/null; then
    GPU_COUNT=$(nvidia-smi --list-gpus | wc -l)
    echo "Detected ${GPU_COUNT} NVIDIA GPU(s) available."
    if [ "$GPU_COUNT" -ge 2 ]; then
        GPU_IMG="${GPU_IMAGE_DEVICE:-0}"
        GPU_VID="${GPU_VIDEO_DEVICE:-1}"
        echo "⚡ Multi-GPU mode: Image pipeline on GPU ${GPU_IMG}, Video pipeline on GPU ${GPU_VID}"
    else
        echo "⚡ Single-GPU mode: Both Image (8188) and Video (8189) running on GPU 0"
        GPU_IMG=0
        GPU_VID=0
    fi
else
    echo "nvidia-smi not in path; defaulting to single device 0"
    GPU_IMG="${GPU_IMAGE_DEVICE:-0}"
    GPU_VID="${GPU_VIDEO_DEVICE:-0}"
fi

# 4. ComfyUI Image Pipeline (Port 8188)
echo "Starting ComfyUI Image Server on GPU ${GPU_IMG} (Port 8188)..."
CUDA_VISIBLE_DEVICES="${GPU_IMG}" python3 "${COMFY_DIR}/main.py" \
    --cuda-malloc \
    --gpu-only \
    --fp8_e4m3fn-unet \
    --port 8188 \
    --listen 0.0.0.0 &
PID_COMFY_IMAGE=$!

# 5. ComfyUI Video Pipeline (Port 8189)
echo "Starting ComfyUI Video Server on GPU ${GPU_VID} (Port 8189)..."
CUDA_VISIBLE_DEVICES="${GPU_VID}" python3 "${COMFY_DIR}/main.py" \
    --cuda-malloc \
    --gpu-only \
    --port 8189 \
    --listen 0.0.0.0 &
PID_COMFY_VIDEO=$!

sleep 4

# 6. Optional Cloudflare Tunnel for ad-hoc mobile QR code downloads
# Starts automatically if ENABLE_CLOUDFLARED=true OR if no formal PUBLIC_URL domain is set
PID_TUNNEL=""
if [ "${ENABLE_CLOUDFLARED:-false}" = "true" ] || [ -z "$PUBLIC_URL" ]; then
    if command -v cloudflared &> /dev/null; then
        echo "Starting Cloudflare Tunnel for mobile QR code downloads..."
        cloudflared tunnel --url http://127.0.0.1:5001 > "${PROJECT_DIR}/dgx_photobooth/tunnel.log" 2>&1 &
        PID_TUNNEL=$!
    fi
fi

# 7. Receiver API (Port 5001)
echo "Starting Photobooth Receiver API (Port 5001)..."
python3 "${PROJECT_DIR}/dgx_photobooth/linux_receiver.py" &
PID_RECEIVER=$!

sleep 2

# 8. Frontend Web App & Theme Studio (Port 5000)
echo "Starting Photobooth Frontend (Port 5000)..."
python3 "${PROJECT_DIR}/kiosk_frontend/app.py" &
PID_FRONTEND=$!

echo "=========================================================="
echo "  ✅ All Photobooth Services are Live and Running!"
echo "     • Frontend & Theme Studio : http://0.0.0.0:5000"
echo "     • Receiver API            : http://0.0.0.0:5001"
echo "     • ComfyUI Image (GPU ${GPU_IMG})   : http://0.0.0.0:8188"
echo "     • ComfyUI Video (GPU ${GPU_VID})   : http://0.0.0.0:8189"
if [ -n "$PUBLIC_URL" ]; then
    echo "     • Domain Public URL       : ${PUBLIC_URL}"
fi
echo "=========================================================="

# Trap termination signals to stop all background processes cleanly
cleanup() {
    echo "Stopping all services..."
    kill -TERM "$PID_FRONTEND" "$PID_RECEIVER" "$PID_COMFY_IMAGE" "$PID_COMFY_VIDEO" $PID_TUNNEL 2>/dev/null || true
    wait
    exit 0
}
trap cleanup SIGINT SIGTERM

wait
