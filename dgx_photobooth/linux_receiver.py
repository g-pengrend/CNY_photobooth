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
import platform
import subprocess
from config import COMFY_OUTPUT_DIR, COMFY_SERVER_ADDRESS, print_config, get_local_ip

# --- Configuration ---
LISTEN_PORT = 5001
base_dir = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(base_dir, 'remote_received_files')
OUTPUT_FOLDER = os.path.join(base_dir, 'remote_outputs')

# Global Settings
PUBLIC_URL = "http://localhost:5001" 

# Ensure directories exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

app = Flask(__name__, template_folder=os.path.join(base_dir, 'templates'))

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

def load_workflow(filename):
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
# --- Clothes mapping is now loaded dynamically from dgx_photobooth/templates/themes/<theme>/clothes_mapping.json ---

def trigger_linux_workflow(uploaded_path, generated_path, orig_filename, gen_filename, theme="cny"):
    print(f"🚀 Starting Linux Workflow execution for theme {theme}...")
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    if theme == "hariraya":
        workflow_file = os.path.join(base_dir, "templates", "themes", "hariraya", "FLF_workflowAPI(HR).json")
    else:
        workflow_file = os.path.join(base_dir, "templates", "themes", "cny", "FLF_workflowAPI(CNY).json")
        
    workflow = load_workflow(workflow_file)
    if not workflow:
        return False
    
    try:
        original_b64 = encode_image_to_base64(uploaded_path)
        generated_b64 = encode_image_to_base64(generated_path)
        
        # --- Prompt Injection Logic ---
        import re
        style_match = re.search(r"(C\d{2})", gen_filename)
        
        # Load theme-specific clothes mapping
        clothes_mapping_file = os.path.join(base_dir, "templates", "themes", theme, "clothes_mapping.json")
        clothes_mapping = {}
        if os.path.exists(clothes_mapping_file):
            with open(clothes_mapping_file, 'r', encoding='utf-8') as f:
                clothes_mapping = json.load(f)
        else:
            print(f"⚠️ Warning: Clothes mapping file not found at {clothes_mapping_file}")

        if style_match:
            code = style_match.group(1)
            style_data = clothes_mapping.get(code)
            
            if style_data:
                style_desc = style_data["desc"]
                lighting_desc = style_data["lighting"]
                print(f"  - Detected Style Code: {code}")
                print(f"    -> Desc: '{style_desc}'")
                print(f"    -> Lighting: '{lighting_desc}'")
                
                # Node 6: FLF Prompt
                if "6" in workflow and "inputs" in workflow["6"]:
                    text = workflow["6"]["inputs"]["text"]
                    
                    if '"style_type"' in text:
                        text = text.replace('"style_type"', style_desc)
                    
                    if '"lighting"' in text:
                        text = text.replace('"lighting"', lighting_desc)
                        
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

# get_local_ip is now imported from config.py

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
    
    theme = request.form.get('theme', 'cny')
    
    print(f"Files received: {orig_filename}, {gen_filename}, Theme: {theme}")
    
    thread = threading.Thread(target=trigger_linux_workflow, args=(orig_path, gen_path, orig_filename, gen_filename, theme))
    thread.start()
    
    return jsonify({
        "status": "received",
        "message": "Images received and workflow started"
    }), 200

@app.route('/receive_print_only', methods=['POST'])
def receive_print_only():
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
    
    theme = request.form.get('theme', 'cny')
    
    print(f"Files received (Print Only): {orig_filename}, {gen_filename}, Theme: {theme}")
    
    # We create a job entry so it shows up in the gallery, but status is 'completed' (for video) or we just mark it as 'photo_only'
    # Actually, the gallery shows 'pending'/'completed' based on video_filename.
    # To make it show up in the gallery as a static image, we can just add it to JOBS with status 'completed' and no video.
    
    new_job = {
        "id": f"print_{timestamp}_{random.randint(1000,9999)}",
        "status": "completed",
        "original_filename": orig_filename,
        "generated_filename": gen_filename,
        "video_filename": None,
        "timestamp": time.time(),
        "print_only": True
    }
    
    with JOBS_LOCK:
        JOBS.append(new_job)

    return jsonify({
        "status": "received",
        "message": "Images received for printing"
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

@app.route('/api/print/<job_id>')
def print_image(job_id):
    """Trigger printing for a specific job's generated image"""
    target_job = None
    with JOBS_LOCK:
        for job in JOBS:
            if job['id'] == job_id:
                target_job = job
                break
    
    if not target_job:
        return jsonify({"error": "Job not found"}), 404
        
    gen_filename = target_job.get('generated_filename')
    if not gen_filename:
        return jsonify({"error": "Generated image not found in job"}), 404
        
    image_path = os.path.join(UPLOAD_FOLDER, gen_filename)
    if not os.path.exists(image_path):
        return jsonify({"error": f"Image file not found: {gen_filename}"}), 404
        
    def run_print_task(path):
        try:
            current_os = platform.system()
            print(f"🖨️  Initiating print job [{current_os}]: {path}")
            
            if current_os == "Windows":
                os.startfile(path, "print")
                print(f"✅ Windows print verb called for: {path}")
            else:
                # Linux: Try lp first, then lpr as fallback
                # Targeting G500USB specifically
                print(f"🔍 Attempting to print to G500USB...")
                
                # We use capture_output to see why it might be failing
                cmd = ['lp', '-d', 'G500USB', path]
                result = subprocess.run(cmd, capture_output=True, text=True)
                
                if result.returncode == 0:
                    print(f"✅ Print job successfully queued: {result.stdout.strip()}")
                else:
                    print(f"⚠️  'lp' failed, trying 'lpr' fallback...")
                    result_lpr = subprocess.run(['lpr', '-P', 'G500USB', path], capture_output=True, text=True)
                    if result_lpr.returncode == 0:
                        print(f"✅ Print job sent via lpr fallback.")
                    else:
                        print(f"❌ Both lp and lpr failed.")
                        print(f"   lp error: {result.stderr.strip()}")
                        print(f"   lpr error: {result_lpr.stderr.strip()}")
                
        except Exception as e:
            print(f"❌ Print logic exception: {e}")

    # Run in background thread
    thread = threading.Thread(target=run_print_task, args=(image_path,), daemon=True)
    thread.start()
    
    return jsonify({"status": "success", "message": "Print job initiated"})

if __name__ == '__main__':
    print_config()
    print(f"🐧 Linux Receiver listening on 0.0.0.0:{LISTEN_PORT}")
    app.run(host='0.0.0.0', port=LISTEN_PORT)
