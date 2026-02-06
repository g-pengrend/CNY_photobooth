import os
import json
import base64
import time
import random
import threading
import urllib.request
import urllib.error
from flask import Flask, request, jsonify
from werkzeug.utils import secure_filename

# --- Configuration ---
LISTEN_PORT = 5001  # Different port to avoid conflict if testing locally
COMFY_SERVER_ADDRESS = "127.0.0.1:8188"  # ComfyUI on this specific Linux machine
UPLOAD_FOLDER = 'remote_received_files'
OUTPUT_FOLDER = 'remote_outputs'

# Ensure directories exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

app = Flask(__name__)

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

def trigger_linux_workflow(uploaded_path, generated_path):
    """
    Placeholder for the second ComfyUI workflow logic.
    This is where you would load the second workflow JSON,
    inject the two images, and queue the job.
    """
    print(f"Starting Linux Workflow with:")
    print(f"  - Original: {uploaded_path}")
    print(f"  - Generated: {generated_path}")
    
    # TODO: Load your specific Linux workflow JSON here
    # workflow = json.load(open("your_second_workflow.json"))
    
    # TODO: Encode images and set them in the workflow nodes
    # ...
    
    # TODO: queue_prompt(workflow)
    
    print("Workflow queued (Placeholder)")
    return True

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
