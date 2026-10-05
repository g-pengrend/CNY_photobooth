# CNY Photobooth (Virtual Try On & Video Generation)

A dual-machine Virtual Try On (VTON) photo booth experience featuring fast Blackwell GPU-accelerated image generation and interactive video animation using ComfyUI.

---

## 🛠️ Requirements & Setup

Before running any script, make sure:
1. **Python / Conda Environment**: You have an Anaconda/Miniconda environment named `comfyui` on Windows/macOS, or `comfy_spark` on Linux.
2. **ComfyUI & Models**: ComfyUI is installed and the models (FaceSwap, workflow dependencies) are pre-loaded on the target GPU machine.
3. **Tailscale**: Tailscale is running on both machines if you are running in remote decoupled mode.
4. **Cloudflare Tunnel (`cloudflared`)**: Installed on the machine running the local/remote receiver to generate public QR codes for mobile downloads:
   - **macOS**: `brew install cloudflared`
   - **Windows**: `winget install --id Cloudflare.cloudflared` or `choco install cloudflared` (or download the binary from [Cloudflare Releases](https://github.com/cloudflare/cloudflared/releases))
   - **Linux (Ubuntu/Debian)**: `sudo apt-get install cloudflared` or download the `.deb` package from Cloudflare.

---

## 🚀 Execution Modes

The CNY Photobooth can be run in three different configurations depending on your hardware availability and deployment needs:

### Mode 1: Remote Decoupled Mode (Recommended for Events)
This mode separates the heavy GPU processing from the kiosk interface. You run the ComfyUI workflows and video generation on a remote Linux GPU server, while running only the lightweight Kiosk web UI, camera feed, and local printer connection on a portable Host PC (Windows or macOS).

```mermaid
graph TD
    subgraph Kiosk PC (At Venue - Windows/macOS)
        A[Browser / Kiosk UI] --> B[Kiosk Frontend app.py]
        B -->|Local print command| C[Local Printer]
    end
    subgraph Remote Linux Server (e.g. breadnbiscuit)
        B -->|Tailscale Port 8188| D[ComfyUI Image Server]
        B -->|Tailscale Port 5001| E[Linux Receiver & ComfyUI Video]
    end
```

#### Step 1: Start the Backend on the Linux Machine
On your remote Linux machine (e.g. `breadnbiscuit`), run:
```bash
./start_fully_linux.sh
```
*This starts the ComfyUI servers (ports 8188 and 8189) and the Linux Receiver (port 5001) under a tmux session with Blackwell optimizations.*

#### Step 2: Start the Kiosk Client on your Host PC
- **Windows Host PC**: Double-click and run:
  ```cmd
  start_kiosk_client.bat
  ```
- **macOS / Linux Client**: Run in your terminal:
  ```bash
  ./start_kiosk_client.sh
  ```
* **Prompt**: The script will show the current configured remote host (defaulting to `breadnbiscuit`). Press **ENTER** to confirm, or type the new Tailscale IP/hostname.
* **Camera & Printing**: Launches the local Flask frontend server (`http://localhost:5000` on Windows/Linux, or `http://localhost:5005` on macOS to prevent AirPlay conflicts) and opens your browser. Camera access works instantly since it's `localhost`, and clicking "Print" sends the job directly to the local printer.

---

### Mode 2: Full Local Mode (Windows Standalone)
Use this mode if you want to run the entire system (ComfyUI backend, Flask frontend, local receiver, and Cloudflare tunnel) on a single Windows machine (e.g., for local testing, development, or debugging).

On your Windows machine, run:
```cmd
start_fully_windows.bat
```
*This spins up separate command windows for the ComfyUI server, Kiosk Frontend, local receiver, and Cloudflare tunnel.*

---

### Mode 3: Standalone Linux Mode
Use this mode if you want to run the entire system locally on a single Linux machine.

On your Linux machine, run:
```bash
./start_fully_linux.sh
```
*This launches everything in tmux. You can access the Kiosk frontend directly at `http://localhost:5000` on the Linux machine.*

---

## 🖨️ How Printing Works

* **In Client/Remote Mode (Windows)**: When a user clicks print, the request hits the local Windows Flask route, which triggers the local printer queue using `os.startfile(image_path, "print")`.
* **In Client/Remote Mode (macOS/Linux)**: The request sends the print job using the system `lp` or `lpr` commands.
* **In Standalone Linux Mode**: The request calls the system `lp` or `lpr` commands to send the job directly to the printer connected to the Linux machine (configured for printer queue `G500USB`).

---


---

## 💻 Running Kiosk Client Only (On a Secondary PC or Laptop)

If you are setting up the photobooth at an event or testing from another PC, **you do NOT need a powerful GPU or CUDA on this client machine**. The client machine only handles:
- The web camera capture and UI (`kiosk_frontend/app.py` on port 5000)
- Local printer spooling (`dgx_photobooth/linux_receiver.py` on port 5001)
- Cloudflare Tunnel (`cloudflared`) to generate mobile download QR codes

All AI inference and video generation happen remotely on the backend GPU machine (e.g. `breadnbiscuit`).

### 1. Prerequisites on the Kiosk Client PC
Before running `start_kiosk_client.bat`, ensure you have installed:

1. **Python 3.10+**:
   - Install the lightweight client dependencies (NO PyTorch/CUDA required):
     ```cmd
     pip install -r requirements_client.txt
     ```
2. **Tailscale (Crucial for remote connection)**:
   - If your ComfyUI backend is on another network, **Tailscale MUST be installed and signed in on this PC**.
   - Download for Windows: [tailscale.com/download/windows](https://tailscale.com/download/windows)
   - Ensure you log into the **same Tailscale account** as the backend PC.
   - *Alternative*: If both machines are on the **same local Wi-Fi router**, you do not need Tailscale. You can use the backend PC's local Wi-Fi IP (e.g., `192.168.1.50`).
3. **Cloudflare Tunnel (`cloudflared`) (For Mobile QR Codes)**:
   - Required so event guests can scan the QR code on the kiosk screen with their phones to download their photos.
   - **Windows Install**: Run in PowerShell or Command Prompt:
     ```cmd
     winget install --id Cloudflare.cloudflared
     ```
   - *Manual Install*: Download `cloudflared-windows-amd64.exe` from [Cloudflare Releases](https://github.com/cloudflare/cloudflared/releases), rename it to `cloudflared.exe`, and place it in the `dgx_photobooth/` folder or the project root.

---

### 2. Launching the Client
Double-click:
```cmd
start_kiosk_client.bat
```

The script will automatically check for Python, Tailscale, and `cloudflared`, then prompt you for the backend host:
```text
The currently configured remote backend host is: [breadnbiscuit]

  Options:
    1) Tailscale hostname: breadnbiscuit (Requires Tailscale running on this PC)
    2) Tailscale direct IP: 100.x.y.z (Bypasses DNS, recommended if hostname fails)
    3) Local Wi-Fi IP: 192.168.x.x (If both PCs on same router, no Tailscale needed)
    4) Localhost: 127.0.0.1 (If ComfyUI is running on THIS PC)

Press ENTER to keep [breadnbiscuit], or type a new Host/IP:
```
- The chosen host is remembered in `.receiver_address`.
- Your browser will open automatically at `http://localhost:5000`.

---

### 3. Common Kiosk Client Issues & Fixes

| Issue | Cause | Fix |
|---|---|---|
| `[Errno 11001] getaddrinfo failed` | Client PC cannot resolve `breadnbiscuit` via DNS. | 1. Ensure Tailscale is installed and connected on **this client PC**.<br>2. Or open `.receiver_address` and replace `breadnbiscuit` with the backend's Tailscale `100.x.x.x` IP or local Wi-Fi IP. |
| `cloudflared is not installed or found in PATH` | Mobile QR codes cannot be generated without Cloudflare tunnel. | Run `winget install --id Cloudflare.cloudflared` or download `cloudflared.exe` into `dgx_photobooth/`. |
| `Camera access denied` | Browser blocked webcam permissions. | The kiosk runs on `http://localhost:5000` which allows camera access by default. Make sure camera permissions are granted in browser settings. |

## 📷 Troubleshooting Camera Access
Browsers restrict camera access on insecure HTTP connections. Since the kiosk UI runs on `http://localhost:5000` (or `http://localhost:5005` on macOS) in Mode 1 and 2, it is treated as secure and works out of the box. 

If you are accessing the photo booth from a mobile device or third-party device on the network, refer to [TROUBLESHOOTING.md](file:///Users/11010308/Documents/Projects/CNY_photobooth/TROUBLESHOOTING.md) for steps on treating insecure origins as secure in Chrome/Edge flags.
