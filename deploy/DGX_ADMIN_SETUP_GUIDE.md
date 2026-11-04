# 🛠️ DGX A100 Cluster Setup & Administration Guide
## SEIT AI Photobooth & Theme Studio Backend

This document contains the exact hardware specifications, volume mounts, port bindings, and deployment steps required by the **DGX Cluster Administrator** to host the Photobooth backend.

---

### 1. Architectural Overview & Ports

The containerized stack runs **4 internal services** supervised inside a single high-performance Docker pod:

| Port | Service | Process | Purpose |
| :--- | :--- | :--- | :--- |
| **`5000`** | **Frontend & Theme Studio** | `kiosk_frontend/app.py` | Serves the web UI, kiosk experience, and Admin Studio. **Target for domain ingress**. |
| **`5001`** | **Receiver API** | `dgx_photobooth/linux_receiver.py` | Workflow orchestrator, prompt injection, QR code gallery, and print queue. |
| **`8188`** | **ComfyUI Image Pipeline** | `ComfyUI/main.py --port 8188` | Priority 0: Virtual Try-On (SDXL / Flux FP8), FaceSwap (ReActor), and Theme Studio asset generation. |
| **`8189`** | **ComfyUI Video Pipeline** | `ComfyUI/main.py --port 8189` | Priority 1: Motion portrait and WanVideo / AnimateDiff video generation. |

---

### 2. Resource Quotas & Hardware Sizing

Please allocate the following resources to this container/pod:

* **GPU Allocation**:
  * **Option A (Recommended for Event Production):** **2x A100 Slices / GPUs** (or 1x 80GB A100).
    * `GPU 0`: Dedicated to ComfyUI Image Pipeline (`port 8188`). Instant guest try-on (5-10s).
    * `GPU 1`: Dedicated to ComfyUI Video Pipeline (`port 8189`). Background motion rendering (30-60s).
    * **Benefit:** 100% concurrent processing with zero queuing pauses, zero VRAM contention, and no stutter.
  * **Option B (Minimum Viable):** **1x 40GB A100 Slice**.
    * Both 8188 and 8189 share GPU 0.
* **vCPUs**: **8 to 16 vCPUs** (InsightFace, YOLO body parsing, and tensor preparation run on the CPU before GPU dispatch).
* **System RAM**: **32 GB to 64 GB**.
* **Shared Memory (`shm_size`)**: **`16gb`** (`--shm-size=16g`).
  > **CRITICAL:** PyTorch multiprocessing and DataLoader tensor IPC will crash with `Bus error` if Docker's default 64MB shared memory is not expanded to at least 8GB–16GB.

---

### 3. Unified Host Mirror Storage (4 Host Directories)

Instead of managing dozens of individual subfolder mounts, the deployment uses **4 unified host mirror directories**:

```bash
# Set your cluster NVMe data path (e.g. /raid/photobooth or /data/photobooth)
export DATA_DIR=/raid/photobooth

mkdir -p $DATA_DIR/{models,custom_nodes,themes,outputs,remote_outputs,remote_received_files}
chmod -R 775 $DATA_DIR
```

#### Container Volume Mount Mapping:
| DGX Host Path | Container Mount Path | Mode | Purpose |
| :--- | :--- | :--- | :--- |
| **`$DATA_DIR/models`** | `/app/ComfyUI/models` | `rw` | **Parent Model Mirror**: Automatically mirrors all model subfolders (`checkpoints/`, `loras/`, `vae/`, `clip/`, `unet/`, `controlnet/`, `insightface/`, `facerestore_models/`). Auto-initialized on startup. |
| **`$DATA_DIR/custom_nodes`** | `/app/ComfyUI/custom_nodes_external` | `ro` | **Custom Nodes Mirror**: Drop any new/future ComfyUI custom node folder here; the container auto-links it on startup. |
| **`$DATA_DIR/themes`** | `/app/kiosk_frontend/static/themes` | `rw` | **Themes & Workflows Mirror**: Dynamic multi-layer theme assets & JSON configs. |
| **`$DATA_DIR/outputs`**<br>`$DATA_DIR/remote_outputs`<br>`$DATA_DIR/remote_received_files` | `/app/kiosk_frontend/outputs`<br>`/app/dgx_photobooth/remote_outputs`<br>`/app/dgx_photobooth/remote_received_files` | `rw` | **Outputs Mirror**: Rendered guest photos, videos, and raw uploads. |

---

### 4. Deployment via Docker Compose

1. Clone or copy the repository onto the DGX server.
2. Navigate to `deploy/docker`:
   ```bash
   cd deploy/docker
   ```
3. Copy and adjust the environment file:
   ```bash
   cp .env.example .env
   # Edit .env to set DATA_DIR, GPU assignments, or passwords if needed
   ```
4. Build and launch in detached background mode:
   ```bash
   docker compose up -d --build
   ```
5. View startup logs:
   ```bash
   docker compose logs -f
   ```

---

### 5. Day-to-Day Maintenance & Lifecycle

#### A. Adding or Swapping AI Models (.safetensors, LoRAs, Checkpoints):
* **No Docker rebuild required.**
* Drop any new model into its corresponding folder in `$DATA_DIR/models/` (e.g. `checkpoints/`, `loras/`, `vae/`, `unet/`).
* ComfyUI discovers newly added models immediately.

#### B. Installing New ComfyUI Custom Nodes in the Future:
* **No Docker rebuild required.**
* Simply clone or copy the custom node into `$DATA_DIR/custom_nodes/`:
  ```bash
  cd $DATA_DIR/custom_nodes
  git clone https://github.com/someuser/Some-New-Comfy-Node.git
  ```
* Restart the container: `docker compose restart`
* The container will automatically detect the node and link it into ComfyUI!

#### C. Updating Workflows (.json):
* Workflows created or edited via the Theme Studio UI (`http://<server-ip>:5000/admin`) save directly to the persistent `$DATA_DIR/themes/` directory and take effect immediately.

#### D. Updating Application Code:
* Because all model weights (80GB+) are mounted externally, building the Docker image is fast:
  ```bash
  git pull
  cd deploy/docker
  docker compose build && docker compose up -d
  ```

---

### 6. Health Checks & Verification

Confirm all 4 endpoints respond:

```bash
# 1. Test Frontend & Theme Studio (Port 5000)
curl -I http://localhost:5000/api/themes
# Expected: HTTP/1.0 200 OK

# 2. Test Receiver API (Port 5001)
curl -I http://localhost:5001/receive_workflow_data
# Expected: HTTP/1.0 405 Method Not Allowed (endpoint is up and listening)

# 3. Test ComfyUI Image Server (Port 8188)
curl http://localhost:8188/system_stats
# Expected: JSON containing GPU device name and VRAM stats

# 4. Test ComfyUI Video Server (Port 8189)
curl http://localhost:8189/system_stats
# Expected: JSON containing GPU device name and VRAM stats
```
