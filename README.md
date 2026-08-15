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

## 📷 Troubleshooting Camera Access
Browsers restrict camera access on insecure HTTP connections. Since the kiosk UI runs on `http://localhost:5000` (or `http://localhost:5005` on macOS) in Mode 1 and 2, it is treated as secure and works out of the box. 

If you are accessing the photo booth from a mobile device or third-party device on the network, refer to [TROUBLESHOOTING.md](file:///Users/11010308/Documents/Projects/CNY_photobooth/TROUBLESHOOTING.md) for steps on treating insecure origins as secure in Chrome/Edge flags.
