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

try:
    import mediapipe as mp
    MEDIAPIPE_AVAILABLE = True
except ImportError:
    MEDIAPIPE_AVAILABLE = False
    print("⚠️ MediaPipe not found. Smart cropping might fail or use fallback.")

# --- Face Framer Logic ---
class FaceFramer:
    def __init__(self):
        if MEDIAPIPE_AVAILABLE:
            self.mp_face_detection = mp.solutions.face_detection
            self.face_detection = self.mp_face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5)
        else:
            # Fallback to Haar Cascade if MediaPipe missing (though user said they installed it)
            self.face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

    def detect_face(self, img):
        """
        Detects the largest face in the image.
        Returns (x, y, w, h) or None if no face found.
        """
        if MEDIAPIPE_AVAILABLE:
            # MediaPipe expects RGB
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            results = self.face_detection.process(img_rgb)
            
            if not results.detections:
                return None
                
            h_img, w_img, _ = img.shape
            
            # Format results into a list of (x, y, w, h)
            faces = []
            for detection in results.detections:
                bboxC = detection.location_data.relative_bounding_box
                x = int(bboxC.xmin * w_img)
                y = int(bboxC.ymin * h_img)
                w = int(bboxC.width * w_img)
                h = int(bboxC.height * h_img)
                faces.append((x, y, w, h))
            
            if not faces:
                return None
            return max(faces, key=lambda f: f[2] * f[3])
        else:
            # Fallback Haar Cascade
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            faces = self.face_cascade.detectMultiScale(gray, 1.1, 4)
            if len(faces) == 0:
                return None
            return max(faces, key=lambda f: f[2] * f[3])

    def get_face_metrics(self, img):
        """
        Calculates face ratios and position relative to the image.
        """
        face = self.detect_face(img)
        if face is None:
            raise ValueError("No face detected in reference image.")
        
        fx, fy, fw, fh = face
        h_img, w_img = img.shape[:2]
        
        metrics = {
            'width_ratio': fw / w_img,       # Face width relative to Image Width
            'height_ratio': fh / h_img,      # Face height relative to Image Height
            'rel_center_x': (fx + fw/2) / w_img, # Face center X relative to Image Width
            'rel_center_y': (fy + fh/2) / h_img, # Face center Y relative to Image Height
            'aspect_ratio': w_img / h_img    # Target Image Aspect Ratio
        }
        return metrics

    def crop_to_match(self, target_img_path, reference_metrics, zoom=1.0):
        """
        Crops the target image to match reference composition EXACTLY (Zoom=1.0).
        Constrains crop to image boundaries to avoid padding/black borders.
        """
        img = cv2.imread(target_img_path)
        if img is None:
            print(f"Error: Could not read {target_img_path}")
            return None

        h_img, w_img = img.shape[:2]

        face = self.detect_face(img)
        if face is None:
            print(f"Error: No face detected in {target_img_path}")
            return None

        fx, fy, fw, fh = face
        face_cx = fx + fw/2
        face_cy = fy + fh/2
        
        # 1. Target Crop Dimensions (Ideal)
        # Based on Reference Face-to-Image Ratio * Zoom (1.0 = Exact Match)
        target_w = int((fw / reference_metrics['width_ratio']) * zoom)
        target_h = int(target_w / reference_metrics['aspect_ratio'])
        
        # 2. Constrain to Image Boundaries (No Padding)
        if target_w > w_img:
            target_w = w_img
            target_h = int(target_w / reference_metrics['aspect_ratio'])
            
        if target_h > h_img:
            target_h = h_img
            target_w = int(target_h * reference_metrics['aspect_ratio'])
            
        # 3. Calculate Top-Left Position (Centering on Face Target)
        crop_x = int(face_cx - (target_w * reference_metrics['rel_center_x']))
        crop_y = int(face_cy - (target_h * reference_metrics['rel_center_y']))
        
        # 4. Clamp Position to Stay Inside Image
        crop_x = max(0, min(crop_x, w_img - target_w))
        crop_y = max(0, min(crop_y, h_img - target_h))
        
        # 5. Crop
        crop_img = img[crop_y:crop_y+target_h, crop_x:crop_x+target_w]
        return crop_img

def perform_smart_crop(target_path, ref_path):
    """
    Attempts to crop the target image to match the reference framing.
    Overwrites target_path with the cropped result if successful.
    """
    print(f"✂️ Attempting smart crop on {target_path}...")
    if not os.path.exists(ref_path):
        print(f"⚠️ Reference image not found at {ref_path}. Skipping smart crop.")
        return False

    try:
        framer = FaceFramer()
        
        # 1. Analyze Reference
        ref_img = cv2.imread(ref_path)
        if ref_img is None:
            print("⚠️ Could not read reference image.")
            return False
            
        metrics = framer.get_face_metrics(ref_img)
        
        # 2. Crop Target (Zoom=1.0 for exact composition match)
        cropped_img = framer.crop_to_match(target_path, metrics, zoom=1.0)
        
        if cropped_img is not None:
            cv2.imwrite(target_path, cropped_img)
            print("✅ Smart crop successful! Overwrote target image.")
            return True
        else:
            print("⚠️ Smart crop failed (detection or calc error). Using original.")
            return False
            
    except Exception as e:
        print(f"❌ Smart crop exception: {e}")
        return False

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
        # --- Smart Cropping ---
        # Attempt to crop the ORIGINAL image to match the reference (bg2.jpeg)
        perform_smart_crop(uploaded_path, REFERENCE_IMAGE_PATH)
        
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
