import os
import json
import base64
import time
import random
import threading
import urllib.request
import urllib.error
from flask import Flask, request, jsonify
import cv2
import numpy as np
from werkzeug.utils import secure_filename

# --- Configuration ---
LISTEN_PORT = 5001  # Different port to avoid conflict if testing locally
COMFY_SERVER_ADDRESS = "127.0.0.1:8188"  # ComfyUI on this specific Linux machine
UPLOAD_FOLDER = 'remote_received_files'
OUTPUT_FOLDER = 'remote_outputs'
REFERENCE_IMAGE_PATH = "bg2.jpeg" # The image to match framing against

# Ensure directories exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

app = Flask(__name__)

# --- Flask Routes ---

# --- ComfyUI Helper Functions (similar to your existing processor) ---
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

def trigger_linux_workflow(uploaded_path, generated_path):
    """
    Load the FLF workflow, inject images, and queue the job.
    """
    print(f"🚀 Starting Linux Workflow execution...")
    print(f"  - Original Image: {uploaded_path}")
    print(f"  - Generated Image: {generated_path}")
    
    # Load the specific workflow for the Linux machine
    workflow = load_workflow("FLF_workflowAPI.json")
    if not workflow:
        return False
    
    try:
        # Convert images to Base64
        original_b64 = encode_image_to_base64(uploaded_path)
        generated_b64 = encode_image_to_base64(generated_path)
        
        # Node #106: Takes the ORIGINAL image (input)
        if "106" in workflow and "inputs" in workflow["106"]:
            print("  - Updating Node #106 with Original Image")
            workflow["106"]["inputs"]["base64_data"] = original_b64
        else:
            print("⚠️ Warning: Node #106 not found in workflow (Expected for Original Image)")

        # Node #107: Takes the GENERATED image (output from previous step)
        if "107" in workflow and "inputs" in workflow["107"]:
            print("  - Updating Node #107 with Generated Image")
            workflow["107"]["inputs"]["base64_data"] = generated_b64
        else:
            print("⚠️ Warning: Node #107 not found in workflow (Expected for Generated Image)")
            
        # Queue the workflow
        print("  - Queuing workflow to ComfyUI...")
        response = queue_prompt(workflow)
        
        if response and 'prompt_id' in response:
            print(f"✅ Workflow queued! Prompt ID: {response['prompt_id']}")
            return True
        else:
            print("❌ Failed to queue workflow.")
            return False
            
    except Exception as e:
        print(f"❌ Error preparing workflow: {e}")
        return False

# --- Flask Routes ---

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy", "system": "Linux Receiver"}), 200

@app.route('/receive_workflow_data', methods=['POST'])
def receive_workflow_data():
    """
    Endpoint to receive two images and trigger the next workflow.
    Expected form data:
    - 'original_image': File
    - 'generated_image': File
    - 'metadata': JSON string (optional, for extra params)
    """
    if 'original_image' not in request.files or 'generated_image' not in request.files:
        return jsonify({"error": "Missing image files (original_image, generated_image)"}), 400

    original_file = request.files['original_image']
    generated_file = request.files['generated_image']
    
    # Save files
    timestamp = int(time.time())
    
    orig_filename = f"received_{timestamp}_orig_{secure_filename(original_file.filename)}"
    gen_filename = f"received_{timestamp}_gen_{secure_filename(generated_file.filename)}"
    
    orig_path = os.path.join(UPLOAD_FOLDER, orig_filename)
    gen_path = os.path.join(UPLOAD_FOLDER, gen_filename)
    
    original_file.save(orig_path)
    generated_file.save(gen_path)
    
    print(f"Files received and saved:\n  {orig_path}\n  {gen_path}")
    
    # Trigger the workflow in a separate thread so we don't block the response
    # You can also do this synchronously if you want to wait for the result
    thread = threading.Thread(target=trigger_linux_workflow, args=(orig_path, gen_path))
    thread.start()
    
    return jsonify({
        "status": "received",
        "message": "Images received and workflow started",
        "files": {
            "original": orig_path,
            "generated": gen_path
        }
    }), 200

if __name__ == '__main__':
    # '0.0.0.0' allows external connections (from the Windows machine)
    print(f"🐧 Linux Receiver listening on 0.0.0.0:{LISTEN_PORT}")
    app.run(host='0.0.0.0', port=LISTEN_PORT)
