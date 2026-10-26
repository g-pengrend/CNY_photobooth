# 🛠️ DGX A100 Cluster Setup & Administration Guide
## SEIT AI Photobooth & Theme Studio Backend

This document contains the exact hardware specifications, volume mounts, port bindings, and deployment steps required by the **DGX Cluster Administrator** to host the Photobooth backend.

---

### 1. Architectural Overview & Ports

The containerized stack runs **4 internal services**:

| Port | Service | Process | Purpose |
| :--- | :--- | :--- | :--- |
| **`5000`** | **Frontend & Theme Studio** | `kiosk_frontend/app.py` | Serves the web UI, kiosk experience, and Admin Studio. **Target for domain ingress**. |
| **`5001`** | **Receiver API** | `dgx_photobooth/linux_receiver.py` | Workflow orchestrator, prompt injection, and queue manager. |
| **`8188`** | **ComfyUI Image Pipeline** | `ComfyUI/main.py --port 8188` | Priority 0: Still Photo Virtual Try-On (SDXL / Flux FP8) and Studio asset generation. |
| **`8189`** | **ComfyUI Video Pipeline** | `ComfyUI/main.py --port 8189` | Priority 1: Motion portrait and AnimateDiff / LivePortrait video animation. |

---

### 2. Resource Quotas & Hardware Sizing

Please allocate the following resources to this container/pod:

* **GPU Allocation**:
  * **Option A (Recommended for Event Production):** **2x 40GB A100 Slices** (or 1x 80GB A100).
    * GPU 0 handles ComfyUI Image (8188).
    * GPU 1 handles ComfyUI Video (8189).
    * Allows 100% concurrent image and video generation with zero queuing delays.
  * **Option B (Minimum Viable):** **1x 40GB A100 Slice** with **NVIDIA MPS** enabled.
    * Both 8188 and 8189 share the 40GB slice using priority scheduling (`CUDA_MPS_CLIENT_PRIORITY=0` for Image, `1` for Video).
* **vCPUs**: **8 to 16 vCPUs** (InsightFace, YOLO body parsing, and tensor preparation run on the CPU before GPU dispatch).
* **System RAM**: **32 GB to 64 GB**.
* **Shared Memory (`shm_size`)**: **`16gb`** (`--shm-size=16g`).
  > **CRITICAL:** PyTorch multiprocessing and DataLoader tensor IPC will crash with `Bus error` if Docker's default 64MB shared memory is not expanded to at least 8GB–16GB.

---

### 3. Persistent Storage & Host Volumes

To ensure fast container updates, **large model weights (30GB–80GB+) must NOT be baked into the Docker image**. Instead, mount them from the DGX high-speed storage (NVMe / RAID / shared filesystem).

> **Note on Paths:** The paths below use `/raid/photobooth` as a standard DGX placeholder. Please replace `/raid/photobooth` with your cluster's actual NVMe mount path (e.g., `/data/photobooth`, `/mnt/nvme/photobooth`, etc.).

#### Required Host Directories to Create on DGX:
```bash
# 1. Model Storage (Read-Only to container)
mkdir -p /raid/photobooth/models/checkpoints
mkdir -p /raid/photobooth/models/loras
mkdir -p /raid/photobooth/models/controlnet
mkdir -p /raid/photobooth/models/insightface

# 2. Writable Application Buffers (Read-Write to container)
mkdir -p /raid/photobooth/outputs
mkdir -p /raid/photobooth/themes
```

#### Container Volume Mount Mapping:
| DGX Host Path (Example) | Container Mount Path | Permissions | Purpose |
| :--- | :--- | :--- | :--- |
| `/raid/photobooth/models/checkpoints` | `/app/ComfyUI/models/checkpoints` | `ro` (Read-Only) | SDXL, Flux FP8, base diffusion checkpoints |
| `/raid/photobooth/models/loras` | `/app/ComfyUI/models/loras` | `ro` (Read-Only) | Custom festival style & clothing LoRAs |
| `/raid/photobooth/models/controlnet` | `/app/ComfyUI/models/controlnet` | `ro` (Read-Only) | OpenPose, Depth, and Canny ControlNets |
| `/raid/photobooth/models/insightface` | `/root/.insightface/models` | `ro` (Read-Only) | Antelopev2 face analysis models |
| `/raid/photobooth/outputs` | `/app/kiosk_frontend/outputs` | `rw` (Read-Write) | Rendered guest photos and motion videos |
| `/raid/photobooth/themes` | `/app/kiosk_frontend/static/themes` | `rw` (Read-Write) | Dynamic multi-layer theme assets & JSON configs |

---

### 4. Deployment Methods

#### Method A: Docker Compose (Standard Container Deployment)

1. Navigate to the deployment folder:
   ```bash
   cd deploy/docker
   ```
2. Verify paths in `docker-compose.yml` match your DGX host storage directory.
3. Build and launch in detached background mode:
   ```bash
   docker compose up -d --build
   ```
4. Verify all 4 services are healthy:
   ```bash
   docker compose logs -f
   ```

#### Method B: Bare Metal / Conda (Without Docker)

If running directly on the DGX host in a Conda environment:
1. Ensure NVIDIA MPS daemon is active:
   ```bash
   ./deploy/linux_mac/gpu_reset.sh
   ```
2. Launch the headless daemon script in a persistent tmux session:
   ```bash
   ./deploy/linux_mac/2_dgx_server_headless.sh
   ```
3. To monitor logs or attach to the session:
   ```bash
   tmux attach -t dgx_photobooth
   # Detach cleanly by pressing: Ctrl+b, then d
   ```

---

### 5. Ingress & Domain Routing

If assigning a domain to the DGX (e.g. `https://photobooth.institution.edu.sg`):

* **Forward port `443` (HTTPS)** via Nginx / Traefik to internal port **`5000`** (`http://127.0.0.1:5000`).
* **WebSocket Ingress**: Ensure WebSocket forwarding is enabled for `/ws` to port **`8188`** so live ComfyUI progress bars function in the browser.
* **Internal Tailscale Routing**:
  If the cluster runs Tailscale, simply ensure the DGX Tailscale node exposes port `5000` and `5001`. Client devices on the same Tailnet can access the web app directly via `http://<DGX-Tailscale-IP>:5000`.

---

### 6. Health Checks & Verification

After startup, run these quick commands to confirm all 4 tiers are operational:

```bash
# 1. Test Frontend & Theme Studio (Port 5000)
curl -I http://localhost:5000/api/themes
# Expected: HTTP/1.0 200 OK

# 2. Test Receiver API (Port 5001)
curl -I http://localhost:5001/receive_workflow_data
# Expected: HTTP/1.0 405 Method Not Allowed (endpoint exists and listens)

# 3. Test ComfyUI Image Server (Port 8188)
curl http://localhost:8188/system_stats
# Expected: JSON containing GPU device name and VRAM stats

# 4. Test ComfyUI Video Server (Port 8189)
curl http://localhost:8189/system_stats
# Expected: JSON containing GPU device name and VRAM stats
```

---

### 7. Support & Troubleshooting

* **Out of Memory during Face Analysis**: Ensure `--shm-size=16g` is specified.
* **GPU CUDA MPS Handshake Failure**: Run `./deploy/linux_mac/gpu_reset.sh` to flush the MPS daemon and restore the GPU to default mode.
* **Theme Assets Not Persisting**: Verify that `/raid/photobooth/themes` is mounted as `rw` (Read-Write).
