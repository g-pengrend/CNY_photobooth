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
│   ├── 1_standalone_full_system.bat   (Everything runs on 1 local Windows PC)
│   ├── 2_kiosk_client_tailscale.bat   (Windows Kiosk Client connected to DGX over Tailscale + local USB printing)
│   └── 3_edge_print_agent.bat         (Domain Mode: runs lightweight print agent on laptop with USB printer)
│
├── linux_mac/                     <- Linux and macOS launchers (.sh)
│   ├── 1_standalone_full_system.sh    (Everything runs on 1 desktop Linux workstation with GUI)
│   ├── 2_dgx_server_headless.sh       (Headless DGX server daemon running 8188 + 8189 + 5001 + 5000 in background)
│   ├── 3_kiosk_client_tailscale.sh    (Kiosk Client on Mac/Linux connecting to DGX over Tailscale + USB printing)
│   ├── 4_edge_print_agent.sh          (Domain Mode: runs lightweight print agent on Mac/Linux with USB printer)
│   └── gpu_reset.sh                   (Emergency NVIDIA MPS daemon reset)
│
└── docker/                        <- DGX Cluster Containerization
    ├── Dockerfile.dgx                 (Full-stack image definition with CUDA 12.4 + PyTorch)
    ├── docker-compose.yml             (Production compose file with persistent model volumes)
    └── entrypoint.sh                  (Supervises 8188 + 8189 + 5001 + 5000)
```

---

## 🎯 Which Setup Should I Use?

### Mode 1: Pure Domain-Hosted Setup (Zero-Install on Laptops)
> **Goal:** The photobooth is hosted on a DGX cluster under a domain name (`https://photobooth.mydomain.edu.sg`). You walk up with a laptop connected to the USB dye-sub photo printer.

* **On the DGX Cluster**: Run Docker (`docker compose -f deploy/docker/docker-compose.yml up -d`) or `./deploy/linux_mac/2_dgx_server_headless.sh`.
* **On the Laptop with the USB Printer**:
  * **Windows**: Double-click `deploy/windows/3_edge_print_agent.bat`
  * **macOS / Linux**: Run `./deploy/linux_mac/4_edge_print_agent.sh`
  * Enter your domain name when prompted.
  * **Result:** Direct photo-to-printer printing with zero browser popups. No Tailscale required on the laptop!

---

### Mode 2: Hybrid Kiosk Setup (Connected to DGX via Tailscale with Local Printing)
> **Goal:** You want to run the full interactive kiosk frontend and local camera on your on-site PC/laptop, while offloading AI rendering to the remote DGX over Tailscale.

* **On the DGX Cluster**: Run `./deploy/linux_mac/2_dgx_server_headless.sh` (or Docker).
* **On the On-Site Kiosk PC**:
  * **Windows**: Double-click `deploy/windows/2_kiosk_client_tailscale.bat`
  * **macOS / Linux**: Run `./deploy/linux_mac/3_kiosk_client_tailscale.sh`
  * **Result:** Native USB photo printing and local camera capture run directly on your PC; compute runs remotely on DGX.

---

### Mode 3: Tailscale Remote IP Access (Zero-Install on Laptop)
> **Goal:** The photobooth is hosted on a remote DGX/Linux machine connected to Tailscale. You want to access and run the booth or Theme Studio from ANY laptop (Mac, Windows, Linux, or iPad) without installing ComfyUI, PyTorch, or cloudflared on your laptop!

* **On the DGX / Host Machine**: Run `./deploy/linux_mac/2_dgx_server_headless.sh` (or Docker).
* **On your Laptop / Mac / Tablet**:
  1. Make sure Tailscale is connected to your Tailnet.
  2. Open any web browser and go to:
     `http://<DGX-Tailscale-IP>:5000` (e.g. `http://100.x.y.z:5000` or `http://breadnbiscuit:5000`).
  3. **No Printing Needed?** That's it! You have 100% full access to the Photobooth and Theme Studio. Guests can download photos/videos to their phones via on-screen QR codes.
  4. **Want Physical USB Printing from this Laptop?**
     * You do **NOT** need to install ComfyUI, PyTorch, or cloudflared on this laptop!
     * Just plug your USB photo printer into the laptop and run the lightweight print agent:
       * **Windows**: Double-click `deploy/windows/3_edge_print_agent.bat` and enter `http://100.x.y.z:5000`
       * **macOS / Linux**: Run `./deploy/linux_mac/4_edge_print_agent.sh` and enter `http://100.x.y.z:5000`
     * **Result:** The print agent fetches finished photos over Tailscale and prints directly to your physical USB printer!

---

### Mode 4: Local Standalone Setup (All on One Workstation)
> **Goal:** You are developing or testing everything on a single Windows or Linux workstation with its own NVIDIA GPU.

* **Windows**: Double-click `deploy/windows/1_standalone_full_system.bat`
* **Linux**: Run `./deploy/linux_mac/1_standalone_full_system.sh`
* **Result:** Boots ComfyUI, Receiver, Frontend, and browser on `localhost:5000`.

---

## ⚙️ Core Ports Reference

| Port | Service | Purpose |
| :--- | :--- | :--- |
| **`5000`** | Frontend & Theme Studio | User interface, booth experience, and theme manager |
| **`5001`** | Receiver API | Workflow dispatcher, prompt injection, and queue manager |
| **`8188`** | ComfyUI Image Server | Still photo VTON try-on and Theme Studio asset generation (Priority 0) |
| **`8189`** | ComfyUI Video Server | Motion portrait and video animation pipeline (Priority 1) |
