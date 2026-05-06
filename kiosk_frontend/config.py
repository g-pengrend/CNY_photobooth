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
_default_mode = "remote" if platform.system() == "Linux" else "local"
DEPLOY_MODE = os.environ.get("DEPLOY_MODE", _default_mode).strip().lower()


# ============================================================
# DEPLOYMENT PROFILES
# ============================================================
PROFILES = {
    "local": {
        # Receiver runs on the same machine
        "LINUX_RECEIVER_URL": "http://localhost:5001/receive_workflow_data",
        
        # ComfyUI output
        "COMFY_OUTPUT_DIR": "/home/ai-cc/Documents/projects/ComfyUI/output" if platform.system() == "Linux" else "C:/Users/Brandon/Documents/comfy/ComfyUI/output",

        # ComfyUI API address (same machine)
        "COMFY_SERVER_ADDRESS": "127.0.0.1:8188",
    },
    "remote": {
        # Receiver runs on the DGX / Linux machine
        "LINUX_RECEIVER_URL": "http://172.20.162.63:5001/receive_workflow_data",
        
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
    print(f"{'='*50}")
    print(f"  [CONFIG] DEPLOY_MODE: {DEPLOY_MODE.upper()}")
    print(f"     Platform:         {platform.system()}")
    print(f"     Receiver URL:     {LINUX_RECEIVER_URL}")
    print(f"     ComfyUI Output:   {COMFY_OUTPUT_DIR}")
    print(f"     ComfyUI Server:   {COMFY_SERVER_ADDRESS}")
    print(f"{'='*50}")
