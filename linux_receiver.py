import os
import json
import base64
import time
import random
import threading
import urllib.request
import urllib.error
import io
import socket
import qrcode
from flask import Flask, request, jsonify, render_template, send_from_directory, send_file
from werkzeug.utils import secure_filename
from config import COMFY_OUTPUT_DIR, COMFY_SERVER_ADDRESS, print_config

# --- Configuration ---
LISTEN_PORT = 5001
UPLOAD_FOLDER = 'remote_received_files'
OUTPUT_FOLDER = 'remote_outputs'

# Global Settings
PUBLIC_URL = "http://localhost:5001" 

# Ensure directories exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

app = Flask(__name__)

# --- Global State ---
JOBS = []  # List of dicts
JOBS_LOCK = threading.Lock()

# --- ComfyUI Helper Functions ---
def queue_prompt(prompt):
    p = {"prompt": prompt}
    data = json.dumps(p).encode('utf-8')
    req = urllib.request.Request(f"http://{COMFY_SERVER_ADDRESS}/prompt", data=data)
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as e:
        print(f"ComfyUI Error: {e.code} - {e.reason}")
        return None
    except Exception as e:
        print(f"Connection Error: {e}")
        return None

def get_history(prompt_id):
    try:
        with urllib.request.urlopen(f"http://{COMFY_SERVER_ADDRESS}/history/{prompt_id}") as response:
            return json.loads(response.read())
    except Exception as e:
        return None

def load_workflow(filename="FLF_workflowAPI.json"):
    try:
        with open(filename, 'r', encoding='utf-8') as file:
            return json.load(file)
    except FileNotFoundError:
        print(f"❌ Error: Workflow file '{filename}' not found.")
        return None

def encode_image_to_base64(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

# --- Helper for Status Checking ---
def find_video_in_outputs(outputs):
    """
    Scans the ComfyUI outputs dictionary for any video file.
    Returns the relative path (subfolder/filename) if found, else None.
    """
    if not outputs:
        return None

    for node_id, output_data in outputs.items():
        # files to check from different keys
        candidates = []
        if 'videos' in output_data: candidates.extend(output_data['videos'])
        if 'gifs' in output_data: candidates.extend(output_data['gifs'])
        if 'images' in output_data: candidates.extend(output_data['images'])
        
        for file_info in candidates:
            fname = file_info.get('filename', '')
            sub = file_info.get('subfolder', '')
            
            if fname.lower().endswith(('.mp4', '.mov', '.webm', '.mkv', '.avi', '.gif')):
                return f"{sub}/{fname}" if sub else fname
                
    return None

# --- Cloudflare Tunnel Monitor ---
def monitor_tunnel_log():
    global PUBLIC_URL
    import time, re, os
    
    log_file = "tunnel.log"
    print("🔍 Starting Cloudflare Tunnel monitor...")
    
    while True:
        try:
            if os.path.exists(log_file):
                with open(log_file, 'r') as f:
                    content = f.read()
                    # Pattern for: https://<random>.trycloudflare.com
                    match = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", content)
                    if match:
                        found_url = match.group(0)
                        if found_url != PUBLIC_URL:
                            PUBLIC_URL = found_url
                            print(f"🌍 Auto-detected Cloudflare URL: {PUBLIC_URL}")
            # Check every 5 seconds
            time.sleep(5)
        except Exception as e:
            print(f"⚠️ Error reading tunnel log: {e}")
            time.sleep(10)

# Start monitor thread
tunnel_thread = threading.Thread(target=monitor_tunnel_log, daemon=True)
tunnel_thread.start()

# --- Background Status Checker ---
def check_comfy_status():
    while True:
        try:
            with JOBS_LOCK:
                # Get a snapshot of pending jobs
                pending_jobs = [j for j in JOBS if j['status'] == 'pending']
            
            for job in pending_jobs:
                prompt_id = job['id']
                history = get_history(prompt_id)
                
                # Check if history exists for this prompt_id
                if history and prompt_id in history:
                    # Job is done
                    outputs = history[prompt_id].get('outputs', {})
                    
                    found_video = find_video_in_outputs(outputs)

                    # Update status
                    with JOBS_LOCK:
                        for j in JOBS:
                            if j['id'] == prompt_id:
                                if found_video:
                                    j['video_filename'] = found_video
                                    j['status'] = 'completed'
                                    print(f"🎉 Job {prompt_id} completed. Video: {found_video}")
                                else:
                                    j['status'] = 'failed'
                                    print(f"⚠️ Job {prompt_id} finished but no video output found.")
                                    
        except Exception as e:
            print(f"Status check loop error: {e}")
            
        time.sleep(2)

# Start background thread
status_thread = threading.Thread(target=check_comfy_status, daemon=True)
status_thread.start()

# --- Clothes Style Mapping ---
# Format: "Code": {"desc": "...", "lighting": "..."}
CLOTHES_MAPPING = {
    "C01": {
        "desc": "jacket in crimson velvet with bold gold dragon-scale embroidery",
        "lighting": "Crimson and Gold"
    },
    "C02": {
        "desc": "jacket in metallic gold floral brocade",
        "lighting": "Golden and Scarlet"
    },
    "C03": {
        "desc": "midnight-black silk with heavy gold-thread dragon-scale embroidery",
        "lighting": "Midnight Blue and Gold"
    },
    "C04": {
        "desc": "deep vermilion robe layered under a black iron chest plate",
        "lighting": "Vermillion and Steel Grey"
    },
    "C05": {
        "desc": "contemporary knee-length dress crafted from metallic gold floral brocade",
        "lighting": "Warm Gold and Soft Red"
    },
    "C06": {
        "desc": "multi-layered dress in moonlight silver and soft peach silk",
        "lighting": "Silver and Peach"
    },
    "C07": {
        "desc": "white cross-collar dress cinched by a wide scarlet waist wrap",
        "lighting": "White and Scarlet"
    },
    "C08": {
        "desc": "short, structured shoulder cape in crimson velvet with gold floral embroidery",
        "lighting": "Crimson and Pink"
    },
    "C09": {
        "desc": "multi-layered, loose-fitting robe in off-white linen with a wide crimson sash",
        "lighting": "Off-white and Crimson"
    },
    "C10": {
        "desc": "structured Cinnabar-red vest with Cyan-blue piping",
        "lighting": "Cinnabar Red and Cyan"
    },
    "C11": {
        "desc": "short-sleeved tunic in Emerald-Green silk with a vibrant Vermilion sash",
        "lighting": "Emerald Green and Gold"
    },
    "C12": {
        "desc": "high-collared unisex robe crafted from iridescent white silk",
        "lighting": "Iridescent White and Indigo"
    }
}

def trigger_linux_workflow(uploaded_path, generated_path, orig_filename, gen_filename):
    print(f"🚀 Starting Linux Workflow execution...")
    workflow = load_workflow("FLF_workflowAPI.json")
    if not workflow:
        return False
    
    try:
        original_b64 = encode_image_to_base64(uploaded_path)
        generated_b64 = encode_image_to_base64(generated_path)
        
        # --- Prompt Injection Logic ---
        import re
        style_match = re.search(r"(C\d{2})", gen_filename)
        if style_match:
            code = style_match.group(1)
            style_data = CLOTHES_MAPPING.get(code)
            
            if style_data:
                style_desc = style_data["desc"]
                lighting_desc = style_data["lighting"]
                print(f"  - Detected Style Code: {code}")
                print(f"    -> Desc: '{style_desc}'")
                print(f"    -> Lighting: '{lighting_desc}'")
                
                # Node 6: FLF Prompt
                if "6" in workflow and "inputs" in workflow["6"]:
                    text = workflow["6"]["inputs"]["text"]
                    
                    if "style_type" in text:
                        text = text.replace("style_type", style_desc)
                    
                    if "lighting" in text:
                        text = text.replace("lighting", lighting_desc)
                        
                    workflow["6"]["inputs"]["text"] = text
                    print("  - Injected style & lighting description into Node #6")
        else:
            print("  - No Style Code (C01-C12) found in filename. Using default prompt.")

        # Node #106: Original
        if "106" in workflow and "inputs" in workflow["106"]:
            workflow["106"]["inputs"]["base64_data"] = original_b64

        # Node #107: Generated
        if "107" in workflow and "inputs" in workflow["107"]:
            workflow["107"]["inputs"]["base64_data"] = generated_b64

        # EXPICITLY USE NODE 61 AS REQUESTED
        job_uid = f"{int(time.time())}_{random.randint(1000,9999)}"
        video_prefix = f"video/job_{job_uid}"
        
        if "61" in workflow and "inputs" in workflow["61"]:
            print(f"  - Updating Node #61 (SaveVideo) with prefix: {video_prefix}")
            workflow["61"]["inputs"]["filename_prefix"] = video_prefix
        else:
             print("⚠️ Warning: Node #61 not found in workflow. Video tracking will fail.")
            
        print("  - Queuing workflow to ComfyUI...")
        response = queue_prompt(workflow)
        
        if response and 'prompt_id' in response:
            prompt_id = response['prompt_id']
            print(f"✅ Workflow queued! Prompt ID: {prompt_id}")
            
            new_job = {
                "id": prompt_id,
                "status": "pending",
                "original_filename": orig_filename,
                "generated_filename": gen_filename,
                "video_filename": None,
                "timestamp": time.time()
            }
            
            with JOBS_LOCK:
                JOBS.append(new_job)
                
            return True
        else:
            print("❌ Failed to queue workflow.")
            return False
            
    except Exception as e:
        print(f"❌ Error preparing workflow: {e}")
        return False

# --- Helper to get Local IP ---
def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # Doesn't have to be reachable
        s.connect(('10.255.255.255', 1)) 
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

# --- Flask Routes ---

@app.route('/')
def index():
    local_ip = get_local_ip()
    return render_template('receiver_index.html', local_ip=local_ip)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy", "system": "Linux Receiver"}), 200

# API to get/set settings (Public URL)
@app.route('/api/settings', methods=['GET', 'POST'])
def handle_settings():
    global PUBLIC_URL
    if request.method == 'POST':
        data = request.json
        if 'public_url' in data:
            PUBLIC_URL = data['public_url'].rstrip('/')
            print(f"🌍 Public URL updated to: {PUBLIC_URL}")
            return jsonify({"status": "success", "public_url": PUBLIC_URL})
    
    return jsonify({"public_url": PUBLIC_URL})

@app.route('/api/jobs')
def get_jobs():
    with JOBS_LOCK:
        return jsonify(JOBS)

@app.route('/uploads/<path:filename>')
def serve_uploads(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

@app.route('/videos/<path:filename>')
def serve_videos(filename):
    # This serves from the ComfyUI output directory
    return send_from_directory(COMFY_OUTPUT_DIR, filename)

@app.route('/receive_workflow_data', methods=['POST'])
def receive_workflow_data():
    if 'original_image' not in request.files or 'generated_image' not in request.files:
        return jsonify({"error": "Missing image files"}), 400

    original_file = request.files['original_image']
    generated_file = request.files['generated_image']
    
    timestamp = int(time.time())
    orig_f = secure_filename(original_file.filename)
    gen_f = secure_filename(generated_file.filename)
    
    orig_filename = f"received_{timestamp}_orig_{orig_f}"
    gen_filename = f"received_{timestamp}_gen_{gen_f}"
    
    orig_path = os.path.join(UPLOAD_FOLDER, orig_filename)
    gen_path = os.path.join(UPLOAD_FOLDER, gen_filename)
    
    original_file.save(orig_path)
    generated_file.save(gen_path)
    
    print(f"Files received: {orig_filename}, {gen_filename}")
    
    thread = threading.Thread(target=trigger_linux_workflow, args=(orig_path, gen_path, orig_filename, gen_filename))
    thread.start()
    
    return jsonify({
        "status": "received",
        "message": "Images received and workflow started"
    }), 200

# --- QR Code & Mobile View Logic ---

@app.route('/mobile/view/<job_id>')
def mobile_view(job_id):
    target_job = None
    with JOBS_LOCK:
        for job in JOBS:
            if job['id'] == job_id:
                target_job = job
                break
    
    if target_job:
        return render_template('mobile_view.html', job=target_job)
    else:
        return "Job not found", 404

@app.route('/api/qr/<job_id>')
def get_qr_code(job_id):
    # 1. Construct the public URL for the mobile view
    mobile_url = f"{PUBLIC_URL}/mobile/view/{job_id}"
    
    # 2. Generate QR Code
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(mobile_url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    
    # 3. Save to memory buffer
    img_io = io.BytesIO()
    img.save(img_io, 'PNG')
    img_io.seek(0)
    
    return send_file(img_io, mimetype='image/png')

if __name__ == '__main__':
    print_config()
    print(f"🐧 Linux Receiver listening on 0.0.0.0:{LISTEN_PORT}")
    app.run(host='0.0.0.0', port=LISTEN_PORT)
