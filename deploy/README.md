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

### 🌐 Mode 1: Domain-Hosted Mode (Public Domain / Cloudflare Tunnel)
> **Goal:** The full stack runs on your DGX cluster. Any client laptop, tablet, or kiosk connects via a custom domain (e.g. `https://photobooth.mydomain.edu.sg`). **Zero Tailscale or software installations required on client devices!**

#### 1. On the DGX Cluster (Host Server):
* Run with Docker:
  ```bash
  docker compose -f deploy/docker/docker-compose.yml up -d
  ```
  *OR* bare-metal in Conda:
  ```bash
  ./deploy/linux_mac/2_dgx_server_headless.sh
  ```
* 💡 **Does the DGX host run `print_agent.py`?** **NO.** The DGX has no physical USB printer attached. It only hosts the web app, ComfyUI, and job queues.

#### 2. On Your Client Laptop / PC (With USB Photo Printer):
* **Web App Access:** Open any browser and go to `https://photobooth.mydomain.edu.sg`.
* **Direct USB Photo Printing:**
  * Plug your USB photo printer into that laptop.
  * Run the lightweight edge print agent:
    * **Windows**: Double-click `deploy/windows/3_edge_print_agent.bat`
    * **macOS / Linux**: Run `./deploy/linux_mac/4_edge_print_agent.sh`
  * Enter your server URL when prompted (e.g. `https://photobooth.mydomain.edu.sg`).
  * **Result:** The agent monitors the server queue, downloads photos, and prints edge-to-edge glossy photos directly through your native OS photo print driver with zero browser popups.

---

### 🔒 Mode 2: Tailscale Remote-Hosted Mode (Private Tailnet)
> **Goal:** DGX cluster runs headless inside your private Tailnet. Your client laptop connects via Tailscale device `breadnbiscuit` or direct IP (`http://100.67.79.127:5000` or `5001`). No public domain, no ComfyUI, and no heavy dependencies on the client laptop.

#### 1. On the DGX Cluster (Host Server: `breadnbiscuit`):
* Ensure Tailscale is running on DGX (`breadnbiscuit` / `100.67.79.127`).
* Launch the headless server daemon:
  ```bash
  ./deploy/linux_mac/2_dgx_server_headless.sh
  ```

#### 2. On Your Client Laptop / PC:
* **Web App Access:**
  * Open any browser and navigate to:
    * **Frontend & Theme Studio**: `http://100.67.79.127:5000` *(or `http://breadnbiscuit:5000`)*
    * **Gallery & Receiver**: `http://100.67.79.127:5001` *(or `http://breadnbiscuit:5001`)*
  * Full photobooth functionality is immediately accessible!
* **Direct USB Photo Printing:**
  * Plug your USB photo printer into the client laptop.
  * Run the edge print agent:
    * **Windows**: Double-click `deploy/windows/3_edge_print_agent.bat` (defaults to `http://100.67.79.127:5000`)
    * **macOS / Linux**: Run `./deploy/linux_mac/4_edge_print_agent.sh`
  * Enter your server address when prompted (or simply press ENTER to keep `http://100.67.79.127:5000`).
  * 💡 *Smart Dual-Port & Alias Polling:* The print agent automatically resolves `breadnbiscuit` to `100.67.79.127` and monitors **both** Port 5000 (Kiosk UI) and Port 5001 (Receiver & Mobile QR) so print jobs triggered from anywhere are printed immediately!

---

### 💻 Mode 3: Local Standalone Setup (All-in-One Single Workstation)
> **Goal:** Everything (ComfyUI, Web UI, print spooler) runs locally on a single Windows or Linux PC/laptop with its own NVIDIA GPU (e.g. RTX 4090 laptop for offline events or testing).

* **On the Local Workstation**:
  * **Windows**: Double-click `deploy/windows/1_standalone_full_system.bat`
  * **Linux**: Run `./deploy/linux_mac/1_standalone_full_system.sh`
* 💡 **Does this use the DGX?** **NO.** Everything runs locally on one machine at `http://localhost:5000` with the USB printer directly connected.

---

### 🛠️ Legacy / Developer Hybrid Mode (Optional)
> **Goal:** Running the Flask web server locally on your on-site PC while routing raw ComfyUI node workflows over Tailscale to the remote Linux machine.
* **Client PC**: Run `deploy/windows/2_kiosk_client_tailscale.bat` or `deploy/linux_mac/3_kiosk_client_tailscale.sh`.
* *(Note: Mode 1 and Mode 2 are recommended over this legacy mode because they require zero local Conda environments on the client PC).*

---

## ⚙️ Core Ports & Print Agent Routing Reference

| Port | Service | Purpose | Print Agent Support |
| :--- | :--- | :--- | :--- |
| **`5000`** | Frontend & Theme Studio | User interface, booth experience, and theme manager | ✅ Supported (`/api/print-queue/pending`) |
| **`5001`** | Receiver API & Mobile QR | Workflow dispatcher, prompt injection, and gallery | ✅ Supported (`/api/print-queue/pending`) |
| **`8188`** | ComfyUI Image Server | Still photo VTON try-on and Theme Studio asset generation | N/A (Internal AI pipeline) |
| **`8189`** | ComfyUI Video Server | Motion portrait and video animation pipeline | N/A (Internal AI pipeline) |

> 💡 **Print Agent Tip:** When running `print_agent.py`, you can enter `http://<IP>:5000` or `http://<IP>:5001` or just `http://<IP>`. The print agent automatically checks both ports on that host, ensuring print jobs sent from the Kiosk screen (port 5000) or from the mobile QR gallery (port 5001) are both received and printed seamlessly.
