# Step 14: Mobile Download (QR Code) - Technical Journey

## 1. Overview
Allows users to download their photo and video to their personal device via QR code.

## 2. Technical Implementation Details
- **QR Generation**: Python `qrcode` library generates a code pointing to the public URL.
- **Tunneling**: `linux_receiver.py` parses `tunnel.log` to find the Cloudflare Tunnel public URL (e.g., `https://random-name.trycloudflare.com`).
- **Mobile View**: `templates/mobile_view.html` provides a simplified interface for downloading.

## 3. Development Journey (From Logs)

### Cloudflare Integration (Ref: `Part6`)
- **Challenge**: The Linux receiver is on a local network (or behind NAT). Mobile phones (on 4G/5G) cannot access `localhost:5001`.
- **Solution**: Used Cloudflare Tunnel (`cloudflared`). The script reads the `tunnel.log` file to extract the dynamically assigned public URL at startup.

### QR Code Validations
- **Frontend Safeguards**: In the gallery UI, before generating and displaying the QR code, the system performs a fetch call to `/api/settings`. If it detects the active URL is still `localhost` or `127.0.0.1`, it aborts the QR generation and alerts the operator to manually configure the Cloudflare tunnel link.
- **Endpoint**: `/api/qr/<job_id>`. 
- **Process**: Constructs the mobile URL, generates a QR image in memory (BytesIO), and serves the PNG stream directly to the frontend modal.

### Mobile Interface (`mobile_view.html`)
- **Responsive Design**: Includes specific `<meta name="viewport">` tags to disable desktop scaling, ensuring the buttons are large and accessible on mobile screens.
- **Direct Downloads**: Implemented HTML5 native `<a download>` attributes on the buttons so touching them triggers the OS-level file downloader instead of opening the media in a new browser tab.
- **Failsafes**: Added explicit "Long press images to save manually" text for edge cases where the mobile browser sandbox blocks automated downloads.
