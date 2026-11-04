"""
CNY Photobooth - Deployment Configuration

Switch between 'local' (single Windows machine) and 'remote' (dual-machine) 
by changing DEPLOY_MODE below, or setting the environment variable:

    set DEPLOY_MODE=local     (Windows cmd)
    export DEPLOY_MODE=remote (Linux bash)
"""

import os
import platform

# ============================================================
# UTILITIES
# ============================================================
def get_local_ip():
    """Returns the local IP address of this machine."""
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1)) 
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

# ============================================================
# DEPLOYMENT MODE & RESOLUTION
# ============================================================
# Dynamic resolution of remote receiver host/IP
cached_host = None
cache_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".receiver_address")
if not os.path.exists(cache_file):
    cache_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".receiver_address")

if os.path.exists(cache_file):
    try:
        with open(cache_file, "r") as f:
            cached_host = f.read().strip()
    except Exception:
        pass

env_ip = os.environ.get("RECEIVER_IP")
env_host = os.environ.get("RECEIVER_HOST")
raw_host = env_ip or env_host or cached_host or "breadnbiscuit"

# Clean all whitespaces, tabs, newlines, and carriage returns
RECEIVER_HOST = "".join(raw_host.split()).strip()

_default_mode = "remote" if platform.system() == "Linux" else "local"
DEPLOY_MODE = os.environ.get("DEPLOY_MODE", _default_mode).strip().lower()


def _detect_local_comfy_port():
    """
    Determine the local ComfyUI address for video generation (dgx_photobooth):
    - On Linux (fully Linux or DGX): Video generator runs on port 8189 (Priority 1 in MPS).
      (Port 8188 is reserved for Kiosk image generation with Priority 0).
    - On Windows: Both image and video generation share port 8188.
    Can be overridden via COMFY_SERVER_ADDRESS or COMFY_PORT environment variables.
    """
    env_server = os.environ.get("COMFY_SERVER_ADDRESS")
    if env_server:
        return env_server.strip()

    env_port = os.environ.get("COMFY_PORT")
    if env_port:
        return f"127.0.0.1:{env_port.strip()}"

    if platform.system() == "Linux":
        # On Linux, video generation explicitly belongs on port 8189
        return "127.0.0.1:8189"
    else:
        # On Windows, single instance runs on port 8188 (fallback to 8189 if active)
        import socket
        for port in [8188, 8189]:
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.settimeout(0.2)
                    if s.connect_ex(('127.0.0.1', port)) == 0:
                        return f"127.0.0.1:{port}"
            except Exception:
                pass
        return "127.0.0.1:8188"

# ============================================================
# DEPLOYMENT PROFILES
# ============================================================
PROFILES = {
    "local": {
        # Receiver runs on the same machine
        "LINUX_RECEIVER_URL": "http://localhost:5001/receive_workflow_data",
        
        # ComfyUI output
        "COMFY_OUTPUT_DIR": os.environ.get("COMFY_OUTPUT_DIR", "/app/ComfyUI/output" if os.path.exists("/app/ComfyUI") else ("/home/ai-cc/Documents/projects/ComfyUI/output" if platform.system() == "Linux" else "C:/Users/Brandon/Documents/comfy/ComfyUI/output")),

        # ComfyUI API address (same machine)
        "COMFY_SERVER_ADDRESS": _detect_local_comfy_port(),
    },
    "remote": {
        # Receiver runs on the DGX / Linux machine
        # NOTE: This IP is used by the WINDOWS Kiosk to find the Linux machine.
        # You can override this by setting the RECEIVER_IP environment variable.
        "LINUX_RECEIVER_URL": f"http://{os.environ.get('RECEIVER_IP', '172.20.162.63')}:5001/receive_workflow_data",
        
        # ComfyUI output on Linux
        "COMFY_OUTPUT_DIR": os.environ.get("COMFY_OUTPUT_DIR", "/app/ComfyUI/output" if os.path.exists("/app/ComfyUI") else "/home/ai-cc/Documents/projects/ComfyUI/output"),

        # ComfyUI API address (same machine as receiver)
        "COMFY_SERVER_ADDRESS": "127.0.0.1:8189",
    },
    "hybrid": {
        # Receiver runs on local Windows machine
        "LINUX_RECEIVER_URL": "http://localhost:5001/receive_workflow_data",
        
        # ComfyUI output on Linux
        "COMFY_OUTPUT_DIR": os.environ.get("COMFY_OUTPUT_DIR", "/app/ComfyUI/output" if os.path.exists("/app/ComfyUI") else "/home/ai-cc/Documents/projects/ComfyUI/output"),

        # ComfyUI API address (remote Linux machine)
        "COMFY_SERVER_ADDRESS": f"{RECEIVER_HOST}:8189",
    },
}


# ============================================================
# RESOLVED CONFIG (import these in other modules)
# ============================================================
def get_config():
    """Returns the active configuration profile as a dict."""
    if DEPLOY_MODE not in PROFILES:
        raise ValueError(
            f"Unknown DEPLOY_MODE: '{DEPLOY_MODE}'. "
            f"Valid options: {list(PROFILES.keys())}"
        )
    return PROFILES[DEPLOY_MODE]


# Convenience: module-level access
_cfg = get_config()

LINUX_RECEIVER_URL = _cfg["LINUX_RECEIVER_URL"]
COMFY_OUTPUT_DIR   = _cfg["COMFY_OUTPUT_DIR"]
COMFY_SERVER_ADDRESS = _cfg["COMFY_SERVER_ADDRESS"]


def print_config():
    """Print active configuration (call at startup for visibility)."""
    current_ip = get_local_ip()
    is_linux = platform.system() == "Linux"
    
    print(f"{'='*50}")
    print(f"  [CONFIG] DEPLOY_MODE: {DEPLOY_MODE.upper()}")
    print(f"     Platform:         {platform.system()}")
    
    if is_linux and DEPLOY_MODE == "remote":
        # On the receiver side, show the ACTUAL local IP detected
        print(f"     Receiver IP:      {current_ip}")
        print(f"     Status:           Awaiting data on port 5001")
    else:
        # On Windows or Local mode, show the configured Target URL
        print(f"     Target Receiver:  {LINUX_RECEIVER_URL}")
        
    print(f"     ComfyUI Output:   {COMFY_OUTPUT_DIR}")
    print(f"     ComfyUI Server:   {COMFY_SERVER_ADDRESS}")
    print(f"{'='*50}")

