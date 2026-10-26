# 🚀 Photobooth Deployment & Script Guide

This directory organizes all launch scripts by **Operating System** and **Deployment Mode**.

---

## 📂 Directory Structure

```
deploy/
├── README.md                      <- This deployment matrix guide
├── windows/                       <- Windows launchers (.bat)
│   ├── 1_standalone_full_system.bat   (Everything runs on 1 Windows PC)
│   ├── 2_kiosk_client_tailscale.bat   (Frontend on Windows, compute on remote DGX via Tailscale)
│   └── 3_edge_print_agent.bat         (Direct Domain: runs print agent on laptop connected to USB printer)
├── linux_mac/                     <- Linux and macOS launchers (.sh)
│   ├── 1_standalone_full_system.sh    (Everything runs on 1 Linux machine)
│   ├── 2_dgx_server_headless.sh       (Headless DGX server daemon)
│   ├── 3_kiosk_client_tailscale.sh    (Kiosk client on Linux/Mac connecting to DGX via Tailscale)
│   ├── 4_edge_print_agent.sh          (Direct Domain: runs print agent on Mac/Linux connected to USB printer)
│   └── gpu_reset.sh                   (Emergency NVIDIA MPS daemon reset)
└── docker/                        <- DGX Cluster Containerization
    ├── Dockerfile.dgx                 (Full-stack image definition with CUDA 12.4 + PyTorch)
    ├── docker-compose.yml             (Production compose file with persistent model volumes)
    └── entrypoint.sh                  (Supervises 8188 + 8189 + 5001 + 5000)
```

---

## 🎯 Which Script Should I Run?

### Mode 1: Pure Domain-Hosted Setup (Zero-Install on Laptops)
> **Goal:** The photobooth is hosted on a DGX cluster under a domain name (`https://photobooth.mydomain.edu.sg`). You walk up with a laptop connected to the USB dye-sub photo printer.

* **On the DGX Cluster**: Run Docker (`docker compose -f deploy/docker/docker-compose.yml up -d`) or `deploy/linux_mac/2_dgx_server_headless.sh`.
* **On the Laptop with the USB Printer**:
  * **Windows**: Double-click `deploy/windows/3_edge_print_agent.bat`
  * **macOS / Linux**: Run `./deploy/linux_mac/4_edge_print_agent.sh`
  * Enter your domain name when prompted.
  * **Result:** Direct photo-to-printer printing with zero browser popups. No Tailscale required on the laptop!

---

### Mode 2: Hybrid Kiosk Setup (Connected to DGX via Tailscale)
> **Goal:** You want to run the full interactive kiosk frontend and local camera on your on-site PC/laptop, while offloading AI rendering to the remote DGX over Tailscale.

* **On the DGX Cluster**: Run `deploy/linux_mac/2_dgx_server_headless.sh` (or Docker).
* **On the On-Site Kiosk PC**:
  * **Windows**: Double-click `deploy/windows/2_kiosk_client_tailscale.bat`
  * **macOS / Linux**: Run `./deploy/linux_mac/3_kiosk_client_tailscale.sh`
  * **Result:** Native USB photo printing and local camera capture run directly on your PC; compute runs remotely on DGX.

---

### Mode 3: Local Standalone Setup (All on One Machine)
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
| **`8188`** | ComfyUI Image Server | Still photo VTON try-on and Theme Studio asset generation |
| **`8189`** | ComfyUI Video Server | Motion portrait and video animation pipeline |
