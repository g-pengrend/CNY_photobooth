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

### QR Code Logic
- **Endpoint**: `/api/qr/<job_id>`.
- **Process**:
  1. Construct URL: `{public_url}/mobile/view/{job_id}`.
  2. Generate QR image in memory (BytesIO).
  3. Serve image directly to the frontend modal.

### Mobile Interface
- **Layout**: Simple, vertical layout optimized for phones.
- **Features**:
  - "Download Photo" button.
  - "Download Video" button (if available).
  - Minimal styling to load fast on mobile networks.
