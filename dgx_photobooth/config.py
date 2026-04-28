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
# DEPLOYMENT MODE 
# ============================================================
# 'local'  → Everything on one Windows machine (testing)
# 'remote' → Photo booth on Windows, receiver on Linux/DGX
#
# Priority: Environment variable > hardcoded default below
# ============================================================
DEPLOY_MODE = os.environ.get("DEPLOY_MODE", "local").strip().lower()


# ============================================================
# DEPLOYMENT PROFILES
# ============================================================
PROFILES = {
    "local": {
        # Receiver runs on the same machine
        "LINUX_RECEIVER_URL": "http://localhost:5001/receive_workflow_data",
        
        # ComfyUI output on Windows
        "COMFY_OUTPUT_DIR": "C:/Users/Brandon/Documents/comfy/ComfyUI/output",

        # ComfyUI API address (same machine)
        "COMFY_SERVER_ADDRESS": "127.0.0.1:8188",
    },
    "remote": {
        # Receiver runs on the DGX / Linux machine
        # NOTE: This IP is used by the WINDOWS Kiosk to find the Linux machine.
        # You can override this by setting the RECEIVER_IP environment variable.
        "LINUX_RECEIVER_URL": f"http://{os.environ.get('RECEIVER_IP', '172.20.162.63')}:5001/receive_workflow_data",
        
        # ComfyUI output on Linux
        "COMFY_OUTPUT_DIR": "/home/ai-cc/Documents/projects/ComfyUI/output",

        # ComfyUI API address (same machine as receiver)
        "COMFY_SERVER_ADDRESS": "127.0.0.1:8188",
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

