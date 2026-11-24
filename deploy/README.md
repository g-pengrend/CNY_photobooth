# 🚀 Photobooth Deployment & Script Guide

This directory organizes all launch scripts by **Operating System** and **Deployment Mode**.

> 📖 **DGX Cluster Administrators**: See the complete hardware quotas, volume mounts, and Docker instructions in [deploy/docker/README.md](file:///c:/Users/Brandon/Desktop/Projects/CNY_photobooth/deploy/docker/README.md).

---

## 📂 Directory Structure

```
deploy/
├── README.md                      <- This deployment matrix guide
│
├── windows/                       <- Windows launchers (.bat)
│   ├── 1_standalone_full_system.bat   (Everything runs on 1 local Windows PC for dev/testing)
│   ├── 2_kiosk_client_tailscale.bat   (Legacy hybrid: runs local Flask on client PC)
│   └── 3_edge_print_agent.bat         (Client laptop: runs print agent connected to USB printer)
│
├── linux_mac/                     <- Linux and macOS launchers (.sh)
│   ├── 1_standalone_full_system.sh    (Single desktop Linux workstation with live multi-window GUI)
│   ├── 2_dgx_server_headless.sh       (Headless DGX daemon running 8188 + 8189 + 5001 + 5000 in background)
│   ├── 3_kiosk_client_tailscale.sh    (Legacy hybrid client for Mac/Linux)
│   ├── 4_edge_print_agent.sh          (Client laptop: runs print agent on Mac/Linux connected to USB printer)
│   └── gpu_reset.sh                   (Emergency NVIDIA MPS daemon reset)
│
└── docker/                        <- DGX Cluster Containerization
    ├── README.md                      (Complete DGX Docker setup & operations guide)
    ├── Dockerfile.dgx                 (Full-stack image definition with CUDA 12.4 + PyTorch)
    ├── docker-compose.yml             (Production compose file with unified model mirrors)
    ├── entrypoint.sh                  (Auto GPU detection, supervisor & model initializer)
    └── .env.example                   (Template for host DATA_DIR & domain config)
```

---

## 🎯 Which Setup Should I Use?

### 🌐 Mode 1: Domain-Hosted Mode (Public Domain / Cloudflare Tunnel) — *Recommended for Events*
> **Goal:** The full stack runs on your DGX cluster. Any client laptop, tablet, or kiosk connects via a custom domain (e.g. `https://photobooth.institution.edu.sg`). **Zero Tailscale or software installations required on client devices!**

#### 1. On the DGX Cluster (Host Server):
* Run with Docker (Recommended):
  ```bash
  cd deploy/docker
  cp .env.example .env
  docker compose up -d --build
  ```
  *See [deploy/docker/README.md](file:///c:/Users/Brandon/Desktop/Projects/CNY_photobooth/deploy/docker/README.md) for full storage setup instructions.*
* *OR* bare-metal in Conda:
  ```bash
  ./deploy/linux_mac/2_dgx_server_headless.sh
  ```
* 💡 **Does the DGX host run `print_agent.py`?** **NO.** The DGX has no physical USB printer attached. It only hosts the web app, ComfyUI, and job queues.

#### 2. On Your Client Laptop / PC (With USB Photo Printer):
* **Web App Access:** Open any browser and go to `https://photobooth.institution.edu.sg`.
* **Direct USB Photo Printing:**
  * Plug your USB photo printer into that laptop.
  * Run the lightweight edge print agent:
    * **Windows**: Double-click `deploy/windows/3_edge_print_agent.bat`
    * **macOS / Linux**: Run `./deploy/linux_mac/4_edge_print_agent.sh`
  * Enter your server URL when prompted (e.g. `https://photobooth.institution.edu.sg`).
  * **Result:** The agent monitors the server queue, downloads photos, and prints edge-to-edge glossy photos directly through your native OS photo print driver with zero browser popups.

---

### 🔒 Mode 2: Tailscale Remote-Hosted Mode (Private Tailnet Fallback)
> **Goal:** DGX cluster runs headless inside your private Tailnet. Your client laptop connects via Tailscale device `breadnbiscuit` or direct IP (`http://100.67.79.127:5000`). No public domain, no ComfyUI, and no heavy dependencies on the client laptop.

#### 1. On the DGX Cluster (Host Server):
* Ensure Tailscale is running on DGX (`sudo tailscale up`).
* Launch container (`cd deploy/docker && docker compose up -d`) or bare-metal script (`./deploy/linux_mac/2_dgx_server_headless.sh`).

#### 2. On Your Client Laptop / PC:
* **Web App Access:**
  * Open any browser and navigate to: `http://100.67.79.127:5000` *(or `http://breadnbiscuit:5000`)*.
* **Direct USB Photo Printing:**
  * Plug your USB photo printer into the client laptop.
  * Run the edge print agent:
    * **Windows**: Double-click `deploy/windows/3_edge_print_agent.bat` (defaults to `http://100.67.79.127:5000`).
    * **macOS / Linux**: Run `./deploy/linux_mac/4_edge_print_agent.sh`.

---

### 💻 Mode 3: Local Standalone Setup (All-in-One Single Workstation)
> **Goal:** Everything (ComfyUI, Web UI, print spooler) runs locally on a single Windows or Linux PC/laptop with its own NVIDIA GPU (e.g. RTX 4090 laptop for offline events or testing).

* **On the Local Workstation**:
  * **Windows**: Double-click `deploy/windows/1_standalone_full_system.bat`
  * **Linux**: Run `./deploy/linux_mac/1_standalone_full_system.sh`
* 💡 **Does this use the DGX?** **NO.** Everything runs locally on one machine at `http://localhost:5000` with the USB printer directly connected.

---

## ⚙️ Core Ports Reference

| Port | Service | Purpose | Print Agent Support |
| :--- | :--- | :--- | :--- |
| **`5000`** | Frontend & Theme Studio | User interface, booth experience, and theme manager | ✅ Supported (`/api/print-queue/pending`) |
| **`5001`** | Receiver API & Mobile QR | Workflow dispatcher, prompt injection, and mobile gallery | ✅ Supported (`/api/print-queue/pending`) |
| **`8188`** | ComfyUI Image Server | Still photo VTON try-on and Theme Studio asset generation | Internal AI pipeline |
| **`8189`** | ComfyUI Video Server | Motion portrait and video animation pipeline | Internal AI pipeline |
