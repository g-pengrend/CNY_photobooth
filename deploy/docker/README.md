# 🐳 DGX A100 Docker Deployment Guide
## SEIT AI Photobooth & Theme Studio Backend

This directory contains the production Docker configuration for containerizing the full Photobooth stack on an **NVIDIA DGX A100** cluster.

---

### 1. Architecture & Port Reference

The container runs **4 internal services** supervised under a single high-performance Docker pod:

| Port | Service | Process | Purpose |
| :--- | :--- | :--- | :--- |
| **`5000`** | **Frontend & Theme Studio** | `kiosk_frontend/app.py` | Web UI, kiosk experience, and Admin Theme Studio. **Primary target for domain ingress / reverse proxy**. |
| **`5001`** | **Receiver API & QR Gallery** | `dgx_photobooth/linux_receiver.py` | Workflow orchestrator, prompt injection, mobile QR gallery, and print queue. |
| **`8188`** | **ComfyUI Image Pipeline** | `ComfyUI/main.py --port 8188` | Virtual Try-On (SDXL / Flux FP8), FaceSwap (ReActor), and Theme Studio asset generation. |
| **`8189`** | **ComfyUI Video Pipeline** | `ComfyUI/main.py --port 8189` | Motion portrait and WanVideo / AnimateDiff video generation. |

---

### 2. Hardware Quotas & Resource Sizing

* **GPU Allocation (Automatic Detection):**
  * **Option A (Recommended): 2x A100 Slices / GPUs** (or 1x 80GB partitioned into 2).
    * `GPU 0`: Dedicated to ComfyUI Image (`:8188`) $\rightarrow$ Instant guest try-on (5-10s).
    * `GPU 1`: Dedicated to ComfyUI Video (`:8189`) $\rightarrow$ Background motion rendering (30-60s).
    * *Zero compute contention, zero queuing pauses, zero VRAM bottleneck.*
  * **Option B: 1x 40GB A100 Slice.**
    * Both pipelines share GPU 0 automatically. Video generation yields when photo try-on is active.
* **Shared Memory (`shm_size`):** **`16gb`** (CRITICAL: PyTorch and DataLoader tensor IPC will crash with `Bus error` if default Docker 64MB shm is not expanded).
* **vCPUs / RAM:** 8–16 vCPUs, 32GB–64GB RAM.

---

### 3. Unified Storage Mirrors (Host NVMe)

To keep Docker builds fast (< 2 mins) and ensure models and guest renders persist across updates, storage is organized into **4 unified host mirrors**:

```bash
# 1. Define your host NVMe/RAID path (e.g. /raid/photobooth or /data/photobooth)
export DATA_DIR=/raid/photobooth

# 2. Create the 4 root folders
mkdir -p $DATA_DIR/{models,custom_nodes,themes,outputs,remote_outputs,remote_received_files}
chmod -R 775 $DATA_DIR
```

#### Volume Mount Mappings:
| Host Path (`$DATA_DIR`) | Container Path | Mode | Purpose |
| :--- | :--- | :--- | :--- |
| **`$DATA_DIR/models`** | `/app/ComfyUI/models` | `rw` | **Parent Model Mirror:** Houses all checkpoints, loras, vae, clip, unet, insightface, and facerestore models. Subfolders are auto-created by the container on first startup. |
| **`$DATA_DIR/custom_nodes`** | `/app/ComfyUI/custom_nodes_external` | `ro` | **Custom Nodes Mirror:** Drop any future ComfyUI custom node here; the container auto-links it on startup. |
| **`$DATA_DIR/themes`** | `/app/kiosk_frontend/static/themes` | `rw` | **Themes & Workflows Mirror:** Dynamic multi-layer theme assets & JSON configs. |
| **`$DATA_DIR/outputs`**<br>`$DATA_DIR/remote_outputs` | `/app/kiosk_frontend/outputs`<br>`/app/dgx_photobooth/remote_outputs` | `rw` | **Outputs Mirror:** Rendered guest photos, videos, and raw uploads. |

---

### 4. Step-by-Step Launch Instructions

```bash
# 1. Navigate to this directory
cd deploy/docker

# 2. Initialize environment configuration
cp .env.example .env

# 3. Edit .env to set your DATA_DIR and optional PUBLIC_URL
nano .env

# 4. Build and start in detached background mode (Takes ~2-3 mins on DGX)
docker compose up -d --build

# 5. Follow live service logs
docker compose logs -f
```

---

### 5. Day-to-Day Maintenance & Lifecycle

* **Adding / Swapping Models (.safetensors, LoRAs):**
  Drop model files directly into `$DATA_DIR/models/checkpoints/` or `$DATA_DIR/models/loras/`. ComfyUI detects them immediately. No Docker rebuild or restart needed.
* **Adding New Custom Nodes in the Future:**
  Git clone the node into `$DATA_DIR/custom_nodes/` and run `docker compose restart`.
* **Updating Application Code:**
  Run `git pull origin main && docker compose up -d --build`. Only the code layer is rebuilt (~30 seconds).

---

### 6. Health Checks & Verification

Confirm all 4 internal endpoints are responding:

```bash
# 1. Frontend & Theme Studio (Port 5000)
curl -I http://localhost:5000/api/themes
# Expected: HTTP/1.0 200 OK

# 2. Receiver API (Port 5001)
curl -I http://localhost:5001/receive_workflow_data
# Expected: HTTP/1.0 405 Method Not Allowed (Endpoint is listening)

# 3. ComfyUI Image Server (Port 8188)
curl http://localhost:8188/system_stats
# Expected: JSON containing GPU device name and VRAM stats

# 4. ComfyUI Video Server (Port 8189)
curl http://localhost:8189/system_stats
# Expected: JSON containing GPU device name and VRAM stats
```

