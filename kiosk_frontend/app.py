from flask import Flask, render_template, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
import os
import sys
import platform
import subprocess
import uuid
import threading
from datetime import datetime
import base64
import json

# Fix Windows console encoding for Chinese/Unicode characters
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')
from comfy_processor import process_image
from face_analysis import generate_lucky_number_from_face


app = Flask(__name__, 
            static_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static'), 
            template_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static'))
CORS(app)

# Store job status in memory (for production, use Redis or database)
jobs = {}

# Configuration
from config import LINUX_RECEIVER_URL, print_config
CURRENT_LINUX_URL = LINUX_RECEIVER_URL

# Configuration
UPLOAD_FOLDER = 'uploads'
OUTPUT_FOLDER = 'outputs'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)


def process_image_async(job_id, input_path, theme='cny', gender='female', pose='', clothes_style='', background='', enable_lucky_number=True):
    """Process image in background thread"""
    try:
        jobs[job_id]['status'] = 'processing'
        jobs[job_id]['message'] = 'Analyzing facial features...'
    
        try:
             # Run face analysis first for the visualizer
             _, measurements = generate_lucky_number_from_face(input_path, theme=theme)
             if measurements:
                 jobs[job_id]['analytics'] = measurements
                 jobs[job_id]['message'] = 'Designing your new look...'
        except Exception as e:
            print(f"Analysis failed (non-fatal): {e}")

        # Call the ComfyUI processor with all parameters
        success, output_file, error = process_image(
            input_path, 
            theme=theme,
            gender=gender,
            pose=pose,
            clothes_style=clothes_style,
            background=background,
            enable_lucky_number=enable_lucky_number
        )
        
        if success:
            jobs[job_id]['status'] = 'completed'
            jobs[job_id]['output_file'] = output_file
            jobs[job_id]['message'] = 'Image processed successfully!'
        else:
            jobs[job_id]['status'] = 'failed'
            jobs[job_id]['error'] = error or 'Unknown error occurred'
            jobs[job_id]['message'] = 'Processing failed'
            
    except Exception as e:
        jobs[job_id]['status'] = 'failed'
        jobs[job_id]['error'] = str(e)
        jobs[job_id]['message'] = f'Error: {str(e)}'
        print(f"Error processing job {job_id}: {e}")
  
    jobs[job_id]['completed_at'] = datetime.now().isoformat()


@app.route('/')
def landing():
    """Serve the neutral VTON landing page"""
    return send_from_directory(app.static_folder, 'landing.html')


RESERVED_SLUGS = {'api', 'static', 'admin', 'uploads', 'outputs'}


@app.route('/api/themes')
def list_themes():
    """List all available themes with their metadata for landing page and studio."""
    themes_dir = os.path.join(app.static_folder, 'themes')
    theme_list = []
    if os.path.exists(themes_dir):
        for slug in os.listdir(themes_dir):
            if slug.startswith('.') or slug in RESERVED_SLUGS:
                continue
            theme_json_path = os.path.join(themes_dir, slug, 'theme.json')
            if os.path.exists(theme_json_path):
                try:
                    with open(theme_json_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        data['slug'] = slug
                        theme_list.append(data)
                except Exception as e:
                    print(f"Error reading {theme_json_path}: {e}")
    return jsonify(theme_list)


@app.route('/api/theme/<theme_slug>')
def get_theme_config(theme_slug):
    """Serve theme.json for a given theme."""
    theme_file = os.path.join(app.static_folder, 'themes', theme_slug, 'theme.json')
    if os.path.exists(theme_file):
        return send_file(theme_file, mimetype='application/json')
    return jsonify({"error": "Theme config not found"}), 404


@app.route('/api/theme/<theme_slug>/data')
def get_theme_data(theme_slug):
    """Serve data.json for a given theme."""
    data_file = os.path.join(app.static_folder, 'themes', theme_slug, 'data.json')
    if os.path.exists(data_file):
        return send_file(data_file, mimetype='application/json')
    return jsonify({"poses": [], "clothes": [], "backgrounds": []}), 404


@app.route('/api/theme/<theme_slug>/samples')
@app.route('/api/<theme_slug>/samples')
def list_theme_samples(theme_slug):
    """Generic sample image lister for any theme's film strip."""
    samples_dir = os.path.join(app.static_folder, 'themes', theme_slug, 'images', 'samples')
    if not os.path.exists(samples_dir):
        return jsonify([])
    valid_ext = ('.png', '.jpg', '.jpeg', '.webp')
    images = [f for f in os.listdir(samples_dir) if f.lower().endswith(valid_ext)]
    return jsonify([f"/static/themes/{theme_slug}/images/samples/{img}" for img in images])


@app.route('/<theme_slug>')
def serve_theme(theme_slug):
    """Serve the Universal Engine for modern themes, with fallback to legacy index.html."""
    if theme_slug in RESERVED_SLUGS:
        return "Not Found", 404
        
    theme_dir = os.path.join(app.static_folder, 'themes', theme_slug)
    if not os.path.exists(theme_dir):
        return "Theme Not Found", 404
        
    # If theme.json exists, serve the Universal Engine
    if os.path.exists(os.path.join(theme_dir, 'theme.json')):
        return send_from_directory(os.path.join(app.static_folder, 'engine'), 'kiosk.html')
        
    # Fallback to legacy index.html if not yet migrated
    if os.path.exists(os.path.join(theme_dir, 'index.html')):
        return send_from_directory(theme_dir, 'index.html')
        
    return "Theme Template Not Found", 404


@app.route('/api/process', methods=['POST'])
def process():
    """Handle image upload and start processing"""
    try:
        # Get image from request
        if 'image' not in request.files:
            return jsonify({'error': 'No image provided'}), 400
        
        image_file = request.files['image']
        
        # Get all selection parameters
        theme = request.form.get('theme', 'cny')
        gender = request.form.get('gender', 'female')
        pose = request.form.get('pose', '')
        pose_code = request.form.get('pose_code', '')
        clothes_style = request.form.get('clothes_style', '')
        clothes_code = request.form.get('clothes_code', '')
        background = request.form.get('background', '')
        background_code = request.form.get('background_code', '')
        enable_lucky_number = request.form.get('enable_lucky_number', 'true').lower() == 'true'
        
        print(f"Received selections:")
        print(f"  Gender: {gender}")
        print(f"  Pose ({pose_code}): {pose[:30]}...")
        print(f"  Clothes ({clothes_code}): {clothes_style[:30]}...")
        print(f"  Background ({background_code}): {background[:30]}...")
        print(f"  Lucky Number: {enable_lucky_number}")
        
        # Generate unique job ID
        job_id = str(uuid.uuid4())
        
        # Save uploaded image
        input_filename = f"{job_id}_input.jpg"
        input_path = os.path.join(UPLOAD_FOLDER, input_filename)
        image_file.save(input_path)
        
        # Initialize job status
        jobs[job_id] = {
            'status': 'queued',
            'message': 'Image uploaded, queuing for processing...',
            'created_at': datetime.now().isoformat(),
            'input_file': input_path,
            'theme': theme,
            'gender': gender,
            'pose': pose,
            'pose_code': pose_code,
            'clothes_style': clothes_style,
            'clothes_code': clothes_code,
            'background': background,
            'background_code': background_code,
            'enable_lucky_number': enable_lucky_number
        }
        
        # Start processing in background thread
        thread = threading.Thread(target=process_image_async, args=(job_id, input_path, theme, gender, pose, clothes_style, background, enable_lucky_number))
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'job_id': job_id,
            'status': 'queued',
            'message': 'Image uploaded successfully'
        }), 202
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/status/<job_id>', methods=['GET'])
def get_status(job_id):
    """Get processing status for a job"""
    if job_id not in jobs:
        return jsonify({'error': 'Job not found'}), 404
    
    job = jobs[job_id]
    response = {
        'job_id': job_id,
        'status': job['status'],
        'message': job.get('message', ''),
        'analytics': job.get('analytics')  # Include analytics if present
    }
    
    if job['status'] == 'completed':
        # Return the processed image as base64
        output_file = job.get('output_file')
        if output_file and os.path.exists(output_file):
            with open(output_file, 'rb') as f:
                image_data = base64.b64encode(f.read()).decode('utf-8')
                response['image'] = f"data:image/png;base64,{image_data}"
    
    elif job['status'] == 'failed':
        response['error'] = job.get('error', 'Unknown error')
    
    return jsonify(response)


@app.route('/api/download/<job_id>', methods=['GET'])
def download_image(job_id):
    """Download the processed image"""
    if job_id not in jobs:
        return jsonify({'error': 'Job not found'}), 404
    
    job = jobs[job_id]
    if job['status'] != 'completed':
        return jsonify({'error': 'Image not ready'}), 400
    
    output_file = job.get('output_file')
    if not output_file or not os.path.exists(output_file):
        return jsonify({'error': 'Output file not found'}), 404
    
    return send_file(output_file, mimetype='image/png', as_attachment=True, download_name='cny_photo.png')



@app.route('/api/print/<job_id>', methods=['GET'])
def print_image(job_id):
    """Trigger print dialog on the server for the processed image"""
    if job_id not in jobs:
        return jsonify({'error': 'Job not found'}), 404
    
    job = jobs[job_id]
    if job['status'] != 'completed':
        return jsonify({'error': 'Image not ready'}), 400
    
    output_file = job.get('output_file')
    if not output_file or not os.path.exists(output_file):
        return jsonify({'error': 'Output file not found'}), 404
    
    abs_path = os.path.abspath(output_file)

    def run_print_job(path):
        try:
            current_os = platform.system()
            print(f"Printing file [{current_os}]: {path}")
            
            if current_os == "Windows":
                os.startfile(path, "print")
            else:
                # Linux fallback
                cmd = ['lp', path]
                result = subprocess.run(cmd, capture_output=True, text=True)
                if result.returncode != 0:
                    print(f"lp failed: {result.stderr}, trying lpr...")
                    subprocess.run(['lpr', path], capture_output=True, text=True)
        except Exception as e:
            print(f"Print error: {e}")

    # Run in background thread to avoid blocking response
    thread = threading.Thread(target=run_print_job, args=(abs_path,))
    thread.daemon = True
    thread.start()
    
    return jsonify({'status': 'sent_to_printer', 'message': 'Print job initiated'}), 200


@app.route('/api/transfer/<job_id>', methods=['POST'])
def transfer_images(job_id):
    """Trigger transfer of original and generated images to the Linux machine"""
    if job_id not in jobs:
        return jsonify({'error': 'Job not found'}), 404
    
    job = jobs[job_id]
    if job['status'] != 'completed':
        return jsonify({'error': 'Image processing not completed'}), 400
    
    input_file = job.get('input_file')
    output_file = job.get('output_file')
    
    if not input_file or not os.path.exists(input_file):
        return jsonify({'error': 'Original input file not found'}), 404
        
    if not output_file or not os.path.exists(output_file):
        return jsonify({'error': 'Generated output file not found'}), 404
        
    theme = job.get('theme', 'cny')
        
    try:
        from remote_transfer import send_images_to_linux
        
        # Run transfer in background to avoid blocking response
        def transfer_task():
            # Construct target filename with codes
            p_code = job.get('pose_code', 'Pxx')
            c_code = job.get('clothes_code', 'Cxx')
            b_code = job.get('background_code', 'Bxx')
            short_id = job_id.split('-')[0]
            target_name = f"{p_code}_{c_code}_{b_code}_{short_id}_generated.png"
            ref_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bg2.jpeg")
            
            success = send_images_to_linux(
                input_file, 
                output_file, 
                target_filename=target_name, 
                receiver_url=CURRENT_LINUX_URL, 
                theme=theme,
                reference_image_path=ref_path
            )
            if success:
                print(f"[OK] Background transfer for job {job_id} successful (File: {target_name})")
            else:
                print(f"[FAIL] Background transfer for job {job_id} failed")

        thread = threading.Thread(target=transfer_task)
        thread.start()
        
        return jsonify({'status': 'transfer_initiated', 'message': 'Transfer to Linux machine started'}), 200
        
    except Exception as e:
        print(f"Transfer error: {e}")
        return jsonify({'error': f"Failed to initiate transfer: {str(e)}"}), 500


@app.route('/api/transfer_print_only/<job_id>', methods=['POST'])
def transfer_print_only(job_id):
    """Trigger transfer of images to Linux for printing ONLY (no animation)"""
    if job_id not in jobs:
        return jsonify({'error': 'Job not found'}), 404
    
    job = jobs[job_id]
    if job['status'] != 'completed':
        return jsonify({'error': 'Image processing not completed'}), 400
    
    input_file = job.get('input_file')
    output_file = job.get('output_file')
    
    if not input_file or not os.path.exists(input_file):
        return jsonify({'error': 'Original input file not found'}), 404
        
    if not output_file or not os.path.exists(output_file):
        return jsonify({'error': 'Generated output file not found'}), 404
        
    theme = job.get('theme', 'cny')
        
    try:
        from remote_transfer import send_images_to_linux
        
        # Robust URL construction for the print-only endpoint
        # Handle cases where CURRENT_LINUX_URL might or might not have a trailing slash
        base_linux_url = CURRENT_LINUX_URL.split('/receive_workflow_data')[0].rstrip('/')
        print_url = f"{base_linux_url}/receive_print_only"
        
        print(f"Transferring for print only to: {print_url}")
        
        # Run transfer in background
        def transfer_task():
            p_code = job.get('pose_code', 'Pxx')
            c_code = job.get('clothes_code', 'Cxx')
            b_code = job.get('background_code', 'Bxx')
            short_id = job_id.split('-')[0]
            target_name = f"PRINT_{p_code}_{c_code}_{b_code}_{short_id}.png"
            ref_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bg2.jpeg")
            
            print(f"Starting print-only background transfer for {job_id}...")
            success = send_images_to_linux(
                input_file, 
                output_file, 
                target_filename=target_name, 
                receiver_url=print_url, 
                theme=theme,
                reference_image_path=ref_path
            )
            if success:
                print(f"✅ [OK] Print-only transfer successful for {job_id}")
            else:
                print(f"❌ [FAIL] Print-only transfer failed for {job_id}")

        thread = threading.Thread(target=transfer_task)
        thread.start()
        
        return jsonify({'status': 'transfer_initiated', 'message': 'Transfer for printing started'}), 200
        
    except Exception as e:
        print(f"Transfer error: {e}")
        return jsonify({'error': f"Failed to initiate transfer: {str(e)}"}), 500


@app.route('/api/settings/linux-url', methods=['GET', 'POST'])
def manage_linux_url():
    global CURRENT_LINUX_URL
    if request.method == 'POST':
        data = request.json
        new_url = data.get('url')
        if new_url:
            CURRENT_LINUX_URL = new_url
            print(f"Update Linux Receiver URL to: {CURRENT_LINUX_URL}")
            return jsonify({'status': 'updated', 'url': CURRENT_LINUX_URL})
# ============================================================
# THEME STUDIO ADMIN ROUTES
# ============================================================
from workflow_inspector import inspect_kiosk_workflow, inspect_video_workflow

@app.route('/admin')
def admin_panel():
    """Serve the Theme Studio Admin SPA."""
    admin_dir = os.path.join(app.static_folder, 'admin')
    return send_from_directory(admin_dir, 'index.html')


@app.route('/api/admin/workflow/inspect', methods=['POST'])
def admin_inspect_workflow():
    """Analyze an uploaded ComfyUI API workflow dictionary and return node bindings."""
    try:
        data = request.json or {}
        workflow = data.get('workflow', {})
        bindings = inspect_kiosk_workflow(workflow)
        return jsonify({
            'status': 'success',
            'bindings': bindings
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/admin/theme/save', methods=['POST'])
def admin_save_theme():
    """Save or update a theme package: theme.json, data.json, bindings.json, and workflow."""
    try:
        payload = request.json or {}
        theme_cfg = payload.get('theme', {})
        asset_data = payload.get('data', {})
        bindings = payload.get('bindings')
        workflow = payload.get('workflow')

        slug = theme_cfg.get('slug', '').strip().lower()
        if not slug or slug in RESERVED_SLUGS:
            return jsonify({'error': f'Invalid slug: "{slug}"'}), 400

        base_dir = os.path.dirname(os.path.abspath(__file__))
        theme_dir = os.path.join(base_dir, 'static', 'themes', slug)
        dgx_theme_dir = os.path.join(base_dir, '..', 'dgx_photobooth', 'templates', 'themes', slug)

        # Create subdirectories
        for subdir in ['images/clothes', 'images/poses', 'images/backgrounds', 'images/samples']:
            os.makedirs(os.path.join(theme_dir, subdir), exist_ok=True)
        os.makedirs(dgx_theme_dir, exist_ok=True)

        # 1. Save theme.json
        theme_json_path = os.path.join(theme_dir, 'theme.json')
        with open(theme_json_path, 'w', encoding='utf-8') as f:
            json.dump(theme_cfg, f, indent=2, ensure_ascii=False)

        # 2. Save data.json
        data_json_path = os.path.join(theme_dir, 'data.json')
        with open(data_json_path, 'w', encoding='utf-8') as f:
            json.dump(asset_data, f, indent=2, ensure_ascii=False)

        # 3. Save bindings.json if present
        if bindings:
            bindings_path = os.path.join(theme_dir, 'bindings.json')
            with open(bindings_path, 'w', encoding='utf-8') as f:
                json.dump(bindings, f, indent=2)

        # 4. Save workflow_kiosk.json if uploaded
        if workflow:
            wf_path = os.path.join(theme_dir, 'workflow_kiosk.json')
            with open(wf_path, 'w', encoding='utf-8') as f:
                json.dump(workflow, f, indent=2)

        # 5. Sync DGX receiver clothes_mapping.json for backwards compatibility
        dgx_mapping = {}
        for item in asset_data.get('clothes', []):
            code = item.get('code')
            if code:
                dgx_mapping[code] = {
                    'desc': item.get('mapping_desc') or item.get('description', ''),
                    'lighting': item.get('lighting', 'Warm cinematic lighting')
                }
        dgx_mapping_path = os.path.join(dgx_theme_dir, 'clothes_mapping.json')
        with open(dgx_mapping_path, 'w', encoding='utf-8') as f:
            json.dump(dgx_mapping, f, indent=2, ensure_ascii=False)

        print(f"✅ [Studio] Successfully saved theme package for: '{slug}'")
        return jsonify({
            'status': 'success',
            'slug': slug,
            'message': f'Theme "{theme_cfg.get("title")}" published successfully'
        }), 200

    except Exception as e:
        print(f"❌ [Studio] Error saving theme: {e}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print("SEIT 4D Vision Studio - Starting...")
    print_config()
    print("Open your browser to: http://localhost:5000")
    print("NOTE: If accessing from another device (e.g., http://192.168.x.x:5000),")
    print("  camera access will be BLOCKED by browsers unless you use HTTPS.")
    print("  Solution: Use 'chrome://flags/#unsafely-treat-insecure-origin-as-secure'")
    print("Make sure ComfyUI is running on 127.0.0.1:8188")
    app.run(debug=True, host='0.0.0.0', port=5000)
