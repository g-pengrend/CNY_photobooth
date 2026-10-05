# Troubleshooting Camera Access

If you see an error like "Unable to access camera" or "Cannot read properties of undefined (reading 'getUserMedia')" when accessing the app from another device (like a Mac or phone) on the same network, follow these steps.

## The Issue
Modern browsers (Chrome, Safari, Edge) force **camera access to be blocked** on insecure connections (HTTP). Secure connections (HTTPS) or `localhost` are required.

When you access via an IP address like `http://172.20.149.75:5000`, the browser considers it insecure.

## Solution 1: Chrome/Edge Flags (Easiest for testing)

1. On the device you are trying to use (e.g., your Mac/Phone), open Chrome or Edge.
2. Type `chrome://flags/#unsafely-treat-insecure-origin-as-secure` in the address bar.
3. Enable the flag "Insecure origins treated as secure".
4. In the text box, enter your server's address: `http://172.20.149.75:5000` (Replace with your actual IP).
5. Click "Relaunch" at the bottom right.
6. Refresh the page. Camera access should now work.

## Solution 2: Use ngrok (Best for sharing)

Use a tunneling service like [ngrok](https://ngrok.com/) to get a free HTTPS URL.

1. Install ngrok.
2. Run command: `ngrok http 5000`
3. Use the provided `https://...` URL on your device.

## Solution 3: Use Localhost (If on same machine)

If you are on the same machine running the server, always use:
`http://localhost:5000` or `http://127.0.0.1:5000`

Do NOT use the IP address (e.g., `192.168.x.x`) even if on the same machine, as browsers might treat it as "public/insecure".


---

# Troubleshooting Network, Tailscale & Remote Errors

## 1. Error: `[Errno 11001] getaddrinfo failed`
This error means the Kiosk PC cannot resolve the hostname of the backend server (e.g. `breadnbiscuit`).

### Causes & Solutions:
1. **Tailscale is not installed or not running on the Kiosk PC**:
   - Download and install Tailscale: [tailscale.com/download/windows](https://tailscale.com/download/windows).
   - Sign in to the **same Tailnet account** as the ComfyUI host.
2. **MagicDNS resolution failure**:
   - Some Windows networks block single-label DNS queries.
   - **Fix**: Open `.receiver_address` in the `CNY_photobooth` folder and replace `breadnbiscuit` with the **numeric Tailscale IP** (e.g. `100.85.x.y`) of the ComfyUI host. Numeric IPs bypass DNS entirely.
3. **Using Local Wi-Fi without Tailscale**:
   - If both machines are on the same Wi-Fi router, get the ComfyUI PC's local IP (e.g. `192.168.1.50` from `ipconfig`) and put that in `.receiver_address`.

---

## 2. Error: `cloudflared is not installed or not in PATH`
- **What it does**: Cloudflare Tunnel creates a temporary public URL for the gallery so attendees can scan the on-screen QR code and download their photos to their smartphones.
- **Fix**:
  1. Open PowerShell and run:
     ```cmd
     winget install --id Cloudflare.cloudflared
     ```
  2. Or download `cloudflared-windows-amd64.exe` from GitHub, rename it to `cloudflared.exe`, and drop it directly into the `dgx_photobooth/` folder.
