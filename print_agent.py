#!/usr/bin/env python3
"""
Photobooth Universal Edge Print Agent
======================================
Connects directly to your Photobooth server (via Domain Name, Tailscale IP, or Localhost),
listens for completed print jobs, downloads the high-res composite photo, and sends it
directly to your physical USB dye-sublimation photo printer with zero browser popups.

Supported Platforms:
  - Windows (Native Win32 Print Spooler / ShellExecute)
  - macOS   (Native CUPS lp / lpr borderless 4x6)
  - Linux   (Native CUPS lp / lpr)

Zero External Dependencies:
  Uses Python standard library (urllib, json, subprocess, os).

Usage:
  python print_agent.py --server https://photobooth.mydomain.edu.sg
  python print_agent.py --server http://100.x.y.z:5000
  python print_agent.py --server http://localhost:5000
"""

import sys
import os
import time
import json
import platform
import subprocess
import argparse
import urllib.request
import urllib.error
import urllib.parse


def send_to_physical_printer(image_path, printer_name=None):
    """
    Direct, native OS photo printing with zero browser dialogs.
    Calibrated for 4x6 / postcard dye-sub photo printers (DNP, Citizen, HiTi, Epson).
    """
    current_os = platform.system()
    abs_path = os.path.abspath(image_path)
    
    if not os.path.exists(abs_path):
        print(f"❌ [PrintAgent] File not found: {abs_path}")
        return False

    print(f"🖨️ [PrintAgent] Sending to physical printer ({current_os}): {os.path.basename(abs_path)}")

    if current_os == "Windows":
        try:
            # 1. Try win32print if pywin32 is available for exact printer targeting
            import win32api
            import win32print
            target_printer = printer_name or win32print.GetDefaultPrinter()
            print(f"   Target Windows Printer: {target_printer}")
            win32api.ShellExecute(0, "printto", abs_path, f'"{target_printer}"', ".", 0)
            return True
        except Exception:
            # 2. Native Windows fallback via os.startfile
            try:
                os.startfile(abs_path, "print")
                return True
            except Exception as e:
                print(f"❌ [PrintAgent] Windows print error: {e}")
                return False

    elif current_os == "Darwin":  # macOS
        try:
            # Native macOS CUPS command line print
            cmd = ['lp']
            if printer_name:
                cmd.extend(['-d', printer_name])
            cmd.extend([
                '-o', 'media=Postcard',        # Standard 4x6 / 100x148mm dye-sub paper
                '-o', 'fit-to-page',           # Scale edge-to-edge
                '-o', 'output-order=normal',
                abs_path
            ])
            res = subprocess.run(cmd, capture_output=True, text=True)
            if res.returncode == 0:
                return True
            print(f"⚠️ lp returned {res.returncode}: {res.stderr}. Retrying simple lpr...")
            fallback = ['lpr']
            if printer_name:
                fallback.extend(['-P', printer_name])
            fallback.append(abs_path)
            res2 = subprocess.run(fallback, capture_output=True, text=True)
            return res2.returncode == 0
        except Exception as e:
            print(f"❌ [PrintAgent] macOS print error: {e}")
            return False

    elif current_os == "Linux":
        try:
            cmd = ['lp']
            if printer_name:
                cmd.extend(['-d', printer_name])
            cmd.extend([
                '-o', 'media=Custom.4x6in',
                '-o', 'fit-to-page',
                abs_path
            ])
            res = subprocess.run(cmd, capture_output=True, text=True)
            return res.returncode == 0
        except Exception as e:
            print(f"❌ [PrintAgent] Linux print error: {e}")
            return False

    else:
        print(f"❌ [PrintAgent] Unsupported OS: {current_os}")
        return False


def resolve_server_endpoints(server_input):
    """
    Resolves input into a list of candidate endpoints to monitor.
    Handles malformed inputs (http:ip, http:/ip, bare ip:port),
    and sets up dual-port polling for 5000 (Frontend) and 5001 (Receiver).
    """
    raw = server_input.strip().rstrip('/')
    
    # 1. Normalize malformed protocol prefixes
    if raw.startswith(('http://', 'https://')):
        s = raw
    elif raw.startswith('http:/'):
        s = 'http://' + raw[6:].lstrip('/')
    elif raw.startswith('https:/'):
        s = 'https://' + raw[7:].lstrip('/')
    elif raw.startswith('http:'):
        s = 'http://' + raw[5:].lstrip('/')
    elif raw.startswith('https:'):
        s = 'https://' + raw[6:].lstrip('/')
    else:
        s = f"http://{raw}"
    
    parsed = urllib.parse.urlparse(s)
    endpoints = [s]
    
    # Tailscale alias mapping for breadnbiscuit / 100.67.79.127
    KNOWN_HOST_ALIASES = {
        "breadnbiscuit": "100.67.79.127",
        "100.67.79.127": "breadnbiscuit"
    }

    # If using IP or localhost with port 5000 or 5001, add sibling port
    if parsed.port in [5000, 5001]:
        sibling_port = 5001 if parsed.port == 5000 else 5000
        sibling_url = f"{parsed.scheme}://{parsed.hostname}:{sibling_port}"
        endpoints.append(sibling_url)
        
        # Also add numeric IP counterpart if hostname is breadnbiscuit
        if parsed.hostname in KNOWN_HOST_ALIASES:
            alt_host = KNOWN_HOST_ALIASES[parsed.hostname]
            endpoints.append(f"{parsed.scheme}://{alt_host}:{parsed.port}")
            endpoints.append(f"{parsed.scheme}://{alt_host}:{sibling_port}")
    elif parsed.port is None and not parsed.hostname.endswith(('.com', '.org', '.edu', '.net', '.sg', '.io')):
        # Bare IP or hostname without port (e.g. breadnbiscuit or 100.67.79.127)
        endpoints = [
            f"{parsed.scheme}://{parsed.hostname}:5000",
            f"{parsed.scheme}://{parsed.hostname}:5001"
        ]
        if parsed.hostname in KNOWN_HOST_ALIASES:
            alt_host = KNOWN_HOST_ALIASES[parsed.hostname]
            endpoints.extend([
                f"{parsed.scheme}://{alt_host}:5000",
                f"{parsed.scheme}://{alt_host}:5001"
            ])
        
    # Deduplicate while preserving order
    seen = set()
    deduped = []
    for ep in endpoints:
        if ep not in seen:
            seen.add(ep)
            deduped.append(ep)
        
    return deduped


def run_agent(server_url, poll_interval=2.0, printer_name=None, output_dir="temp_prints"):
    endpoints = resolve_server_endpoints(server_url)
    os.makedirs(output_dir, exist_ok=True)
    
    current_os = platform.system()
    print("=" * 65)
    print("  🎨 PHOTOBOOTH UNIVERSAL EDGE PRINT AGENT")
    print("=" * 65)
    print(f"  • Monitored Server(s) : {', '.join(endpoints)}")
    print(f"  • Operating System    : {current_os}")
    print(f"  • Target Printer      : {printer_name or 'System Default Photo Printer'}")
    print(f"  • Poll Interval       : {poll_interval}s")
    print(f"  • Download Folder     : {os.path.abspath(output_dir)}")
    print("=" * 65)
    print("Connecting to photobooth print queue...")

    # Connectivity Check across endpoints
    reachable = 0
    had_404 = False
    for ep in endpoints:
        try:
            req = urllib.request.Request(f"{ep}/api/print-queue/pending", headers={'User-Agent': 'PhotoboothPrintAgent/1.0'})
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                print(f"✅ Connected to [{ep}]! Pending jobs: {data.get('count', 0)}")
                reachable += 1
        except urllib.error.HTTPError as he:
            if he.code == 404:
                had_404 = True
                print(f"⚠️ Notice: [{ep}] returned HTTP 404 Not Found.")
            else:
                print(f"⚠️ Notice: [{ep}] HTTP error: {he}")
        except Exception as e:
            print(f"⚠️ Notice: [{ep}] not reached ({e}). Will keep retrying...")

    if had_404:
        print("\n💡 [Troubleshooting Note for 404 Error]")
        print("   If your server on DGX was already running, it may be running older code.")
        print("   On the DGX server, please run:")
        print("     1. git pull")
        print("     2. tmux kill-session -t dgx_photobooth")
        print("     3. ./deploy/linux_mac/2_dgx_server_headless.sh\n")

    if reachable == 0:
        print("   Agent will poll all endpoints automatically until servers come online...")

    seen_jobs = set()

    while True:
        for srv in endpoints:
            try:
                pending_url = f"{srv}/api/print-queue/pending"
                req = urllib.request.Request(pending_url, headers={'User-Agent': 'PhotoboothPrintAgent/1.0'})
                with urllib.request.urlopen(req, timeout=8) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    jobs = data.get('jobs', [])

                    for item in jobs:
                        job_id = item.get('job_id')
                        if not job_id or job_id in seen_jobs:
                            continue

                        print(f"\n⚡ [PrintAgent] Incoming print job: {job_id} from {srv}")
                        image_rel_url = item.get('image_url', '')
                        if image_rel_url.startswith('http'):
                            download_url = image_rel_url
                        else:
                            download_url = f"{srv}{image_rel_url}"

                        filename = os.path.basename(image_rel_url) or f"{job_id}.png"
                        local_filepath = os.path.join(output_dir, filename)

                        print(f"   Downloading: {download_url}")
                        img_req = urllib.request.Request(download_url, headers={'User-Agent': 'PhotoboothPrintAgent/1.0'})
                        with urllib.request.urlopen(img_req, timeout=30) as img_resp:
                            with open(local_filepath, 'wb') as f:
                                f.write(img_resp.read())

                        print(f"   Saved locally: {local_filepath}")
                        
                        # Send directly to physical printer
                        success = send_to_physical_printer(local_filepath, printer_name)
                        if success:
                            seen_jobs.add(job_id)
                            print(f"✅ [PrintAgent] Job {job_id} dispatched to physical printer!")
                            
                            # Acknowledge to server
                            try:
                                ack_url = f"{srv}/api/print-queue/ack/{urllib.parse.quote(job_id)}"
                                ack_req = urllib.request.Request(ack_url, data=b"", headers={'User-Agent': 'PhotoboothPrintAgent/1.0'})
                                with urllib.request.urlopen(ack_req, timeout=5) as ack_resp:
                                    pass
                            except Exception as ae:
                                print(f"   (Notice: Could not send ack to server: {ae})")
                        else:
                            print(f"❌ [PrintAgent] Failed to print job {job_id}")

            except urllib.error.URLError:
                # Normal when an endpoint is temporarily idle or offline
                pass
            except Exception as e:
                pass

        time.sleep(poll_interval)


def main():
    parser = argparse.ArgumentParser(
        description="Photobooth Universal Edge Print Agent (Zero-Install Direct Printer Bridge)"
    )
    parser.add_argument(
        "--server",
        default="http://100.67.79.127:5000",
        help="Photobooth Server URL (e.g. http://100.67.79.127:5000, http://breadnbiscuit:5000, or domain)"
    )
    parser.add_argument(
        "--printer",
        default=None,
        help="Name of target photo printer (optional, defaults to system default)"
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=2.0,
        help="Polling interval in seconds (default: 2.0)"
    )
    parser.add_argument(
        "--output-dir",
        default="temp_prints",
        help="Directory to save downloaded photos (default: temp_prints)"
    )
    args = parser.parse_args()
    
    try:
        run_agent(
            server_url=args.server,
            poll_interval=args.interval,
            printer_name=args.printer,
            output_dir=args.output_dir
        )
    except KeyboardInterrupt:
        print("\n🛑 Print agent stopped by user.")
        sys.exit(0)


if __name__ == "__main__":
    main()
