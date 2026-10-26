# 🚀 Photobooth Deployment & Script Guide

This directory organizes all launch scripts by **Operating System** and **Deployment Mode**.

> 📖 **DGX Cluster Administrators**: See the complete hardware quotas, volume mounts, and Docker instructions in [DGX_ADMIN_SETUP_GUIDE.md](file:///c:/Users/Brandon/Desktop/Projects/CNY_photobooth/deploy/DGX_ADMIN_SETUP_GUIDE.md).

---

## 📂 Directory Structure

```
deploy/
├── README.md                      <- This deployment matrix guide
├── DGX_ADMIN_SETUP_GUIDE.md       <- Technical briefing document for DGX cluster administrators
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
    ├── Dockerfile.dgx                 (Full-stack image definition with CUDA 12.4 + PyTorch)
    ├── docker-compose.yml             (Production compose file with persistent model volumes)
    └── entrypoint.sh                  (Supervises 8188 + 8189 + 5001 + 5000)
```

---

## 🎯 Which Setup Should I Use?

### 🌟 Mode 1: DGX-Hosted Stack (Primary Production Mode)
> **Goal:** The entire photobooth stack runs on your DGX A100 cluster. You access the photobooth and Theme Studio from any client device (laptop, Mac, PC, iPad) either via **Custom Domain Name** or **Tailscale IP**.

#### 1. On the DGX Cluster (Host Server):
* Run with Docker:
  ```bash
  docker compose -f deploy/docker/docker-compose.yml up -d
  ```
  *OR* run bare-metal in Conda:
  ```bash
  ./deploy/linux_mac/2_dgx_server_headless.sh
  ```
* 💡 **Does the DGX host run `print_agent.py`?** **NO.** The DGX in the server room has no physical USB printer attached. It only hosts the web app, ComfyUI, and the job queues.

#### 2. On Your Client Laptop / PC / Tablet:
* **Step A (Open Web App):**
  * Open any browser (Chrome, Safari, Edge) and go to your server address:
    * **Via Public Domain**: `https://photobooth.mydomain.edu.sg` *(No Tailscale needed!)*
    * **Via Tailscale Network**: `http://<DGX-Tailscale-IP>:5000` *(e.g. `http://100.x.y.z:5000`)*
  * You now have 100% full access to the Photobooth and Theme Studio with zero local installations!
* **Step B (Optional - If you want physical USB Photo Printing):**
  * Plug your USB photo printer into that laptop.
  * Run the lightweight edge print agent (no ComfyUI, no cloudflared, no Conda required on the laptop!):
    * **Windows**: Double-click `deploy/windows/3_edge_print_agent.bat`
    * **macOS / Linux**: Run `./deploy/linux_mac/4_edge_print_agent.sh`
  * Enter your server URL when prompted (`https://photobooth.mydomain.edu.sg` or `http://100.x.y.z:5000`).
  * **Result:** The agent listens to the server queue, downloads the high-res composite image, and prints edge-to-edge glossy photos directly through your native OS photo print driver with zero browser popups.

---

### 💻 Mode 2: Local Standalone Setup (Single PC for Dev & Testing)
> **Goal:** You are developing, designing themes, or testing everything offline on a single Windows or Linux workstation that has its own NVIDIA GPU.

* **On the Local Workstation**:
  * **Windows**: Double-click `deploy/windows/1_standalone_full_system.bat`
  * **Linux**: Run `./deploy/linux_mac/1_standalone_full_system.sh`
* 💡 **Does this use the DGX?** **NO.** Everything runs locally on one machine on `http://localhost:5000`.

---

### ⚙️ Mode 3: Legacy Hybrid Setup (Optional / Developer Legacy)
> **Goal:** Running the Flask web server locally on your on-site PC while routing raw ComfyUI node workflows over Tailscale to the remote Linux machine.

* **On the Remote Machine**: Run ComfyUI on `8188` & `8189`.
* **On the Client PC**:
  * **Windows**: Double-click `deploy/windows/2_kiosk_client_tailscale.bat`
  * **macOS / Linux**: Run `./deploy/linux_mac/3_kiosk_client_tailscale.sh`
* *(Note: Mode 1 with the lightweight print agent is much faster and lighter since you don't need a local Conda environment on the client PC).*

---

## ⚙️ Core Ports Reference

| Port | Service | Purpose |
| :--- | :--- | :--- |
| **`5000`** | Frontend & Theme Studio | User interface, booth experience, and theme manager |
| **`5001`** | Receiver API | Workflow dispatcher, prompt injection, and queue manager |
| **`8188`** | ComfyUI Image Server | Still photo VTON try-on and Theme Studio asset generation (Priority 0) |
| **`8189`** | ComfyUI Video Server | Motion portrait and video animation pipeline (Priority 1) |
