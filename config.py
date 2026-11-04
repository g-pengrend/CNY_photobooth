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
# DEPLOYMENT MODE 
# ============================================================
# 'local'  → Everything on one Windows machine (testing)
# 'remote' → Photo booth on Windows, receiver on Linux/DGX
#
# Priority: Environment variable > hardcoded default below
# ============================================================
DEPLOY_MODE = os.environ.get("DEPLOY_MODE", "local").strip().lower()

# Dynamic resolution of remote receiver host/IP
cached_host = None
cache_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".receiver_address")
if not os.path.exists(cache_file):
    cache_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kiosk_frontend", ".receiver_address")

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


# ============================================================
# THEME STUDIO ADMIN ACCESS & SECURITY
# ============================================================
# Password required to enter Theme Studio (/admin).
# If the admin forgets or wants to change the password, simply
# edit the value below. This file is tracked in source control,
# making it easy to recover, change, push, and pull on GitHub.
# (Can also be overridden by setting the THEME_STUDIO_PASSWORD environment variable)
THEME_STUDIO_PASSWORD = os.environ.get("THEME_STUDIO_PASSWORD", "admin")


def _detect_comfy_output_dir():
    if os.environ.get("COMFY_OUTPUT_DIR"):
        return os.environ.get("COMFY_OUTPUT_DIR").strip()
    if os.path.exists("/app/ComfyUI/output"):
        return "/app/ComfyUI/output"
    if platform.system() == "Linux":
        return "/home/ai-cc/Documents/projects/ComfyUI/output"
    return "C:/Users/Brandon/Documents/comfy/ComfyUI/output"


# ============================================================
# DEPLOYMENT PROFILES
# ============================================================
PROFILES = {
    "local": {
        # Receiver runs on the same machine
        "LINUX_RECEIVER_URL": "http://localhost:5001/receive_workflow_data",
        
        # ComfyUI output
        "COMFY_OUTPUT_DIR": _detect_comfy_output_dir(),

        # ComfyUI API address (same machine)
        "COMFY_SERVER_ADDRESS": "127.0.0.1:8188",
    },
    "remote": {
        # Receiver runs on the DGX / Linux machine
        "LINUX_RECEIVER_URL": f"http://{RECEIVER_HOST}:5001/receive_workflow_data",
        
        # ComfyUI output on Linux
        "COMFY_OUTPUT_DIR": _detect_comfy_output_dir(),

        # ComfyUI API address (same machine as receiver)
        "COMFY_SERVER_ADDRESS": f"{RECEIVER_HOST}:8188",
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
    print(f"{'='*50}")
    print(f"  [CONFIG] DEPLOY_MODE: {DEPLOY_MODE.upper()}")
    print(f"     Platform:         {platform.system()}")
    print(f"     Receiver URL:     {LINUX_RECEIVER_URL}")
    print(f"     ComfyUI Output:   {COMFY_OUTPUT_DIR}")
    print(f"     ComfyUI Server:   {COMFY_SERVER_ADDRESS}")
    if DEPLOY_MODE == "remote":
        print(f"  --------------------------------------------------")
        print(f"  NOTE: Connected to remote Tailscale/Host: '{RECEIVER_HOST}'")
        print(f"  If your servers are running elsewhere, make sure to")
        print(f"  change it in your environment or start script.")
    print(f"{'='*50}")
