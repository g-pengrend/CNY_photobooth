from flask import Flask, request, jsonify, send_file, send_from_directory, session, redirect
from flask_cors import CORS
import os
import sys
import platform
import subprocess
import uuid
import threading
from datetime import datetime, timedelta
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

# Flask Session Configuration for Theme Studio password protection
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "cny-photobooth-theme-studio-auth-key-2026")
app.permanent_session_lifetime = timedelta(days=7)

# Store job status in memory (for production, use Redis or database)
jobs = {}

# Configuration & Network
from config import LINUX_RECEIVER_URL, print_config, THEME_STUDIO_PASSWORD
CURRENT_LINUX_URL = LINUX_RECEIVER_URL

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
    """Serve the neutral VTON landing page, automatically locking Theme Studio when exited."""
    session.pop('admin_authenticated', None)
    return send_from_directory(app.static_folder, 'landing.html')


RESERVED_SLUGS = {'api', 'static', 'admin', 'uploads', 'outputs', 'master', 'guides'}


@app.route('/api/themes')
def list_themes():
    """List all available themes with their metadata for landing page and studio."""
    themes_dir = os.path.join(app.static_folder, 'themes')
    theme_list = []
    if os.path.exists(themes_dir):
        for slug in os.listdir(themes_dir):
            if slug.startswith('.') or slug in RESERVED_SLUGS:
                continue
            theme_folder = os.path.join(themes_dir, slug)
            if not os.path.isdir(theme_folder):
                continue
            theme_json_path = os.path.join(theme_folder, 'theme.json')
            if os.path.exists(theme_json_path):
                try:
                    with open(theme_json_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        data['slug'] = slug
                        theme_list.append(data)
                except Exception as e:
                    print(f"Error reading {theme_json_path}: {e}")
            else:
                # Auto-synthesize default theme.json so any theme directory on disk is visible, editable, and deletable in Studio
                try:
                    clean_title = slug.replace('_', ' ').replace('-', ' ').title()
                    fallback_data = {
                        "slug": slug,
                        "title": clean_title,
                        "icon": "✨",
                        "status": "live",
                        "badge": "Experience",
                        "description": f"Celebrate with the {clean_title} experience.",
                        "cta": "Start Experience",
                        "features": { "luckyNumber": False, "filmStrip": False, "genderFilter": True },
                        "style": { "colors": { "background": "#0a0a12", "text": "#ffffff", "accent": "#6366f1" } }
                    }
                    with open(theme_json_path, 'w', encoding='utf-8') as f:
                        json.dump(fallback_data, f, indent=2)
                    theme_list.append(fallback_data)
                    print(f"✨ [Studio] Auto-created missing theme.json for: {slug}")
                except Exception as e:
                    print(f"Error creating fallback {theme_json_path}: {e}")
    return jsonify(theme_list)


@app.route('/api/theme/<theme_slug>', methods=['GET', 'DELETE'])
def manage_theme_config(theme_slug):
    """Serve or delete a theme by slug."""
    if request.method == 'DELETE':
        if theme_slug in RESERVED_SLUGS:
            return jsonify({'error': f'Cannot delete reserved system folder: {theme_slug}'}), 400

        base_dir = os.path.dirname(os.path.abspath(__file__))
        theme_dir = os.path.join(app.static_folder, 'themes', theme_slug)
        dgx_theme_dir = os.path.join(base_dir, '..', 'dgx_photobooth', 'templates', 'themes', theme_slug)

        try:
            import shutil
            if os.path.exists(theme_dir):
                shutil.rmtree(theme_dir)
            if os.path.exists(dgx_theme_dir):
                shutil.rmtree(dgx_theme_dir)
            print(f"🗑️ [Studio] Deleted theme: {theme_slug}")
            return jsonify({'status': 'success', 'message': f'Theme "{theme_slug}" deleted successfully'})
        except Exception as e:
            print(f"❌ Error deleting theme {theme_slug}: {e}")
            return jsonify({'error': f'Failed to delete theme: {str(e)}'}), 500

    # GET request
    theme_file = os.path.join(app.static_folder, 'themes', theme_slug, 'theme.json')
    if os.path.exists(theme_file):
        return send_file(theme_file, mimetype='application/json')
    # Fallback config for drafts being compiled or previewed
    return jsonify({
        "slug": theme_slug,
        "title": theme_slug.replace('_', ' ').title(),
        "status": "draft",
        "atmosphereMode": "advanced",
        "features": { "luckyNumber": False, "filmStrip": False, "genderFilter": True },
        "style": { "colors": { "background": "#0a0a12", "text": "#ffffff", "accent": "#6366f1" } }
    }), 200


@app.route('/api/theme/<theme_slug>/bindings', methods=['GET'])
def get_theme_bindings_api(theme_slug):
    """Retrieve ComfyUI node bindings for a theme, inspecting workflow or using fallback defaults."""
    theme_dir = os.path.join(app.static_folder, 'themes', theme_slug)
    if not os.path.exists(theme_dir):
        return jsonify({'error': f'Theme "{theme_slug}" not found'}), 404
    from workflow_inspector import load_theme_bindings
    bindings = load_theme_bindings(theme_dir)
    return jsonify(bindings), 200


@app.route('/api/admin/theme/delete', methods=['POST'])
def admin_delete_theme_post():
    """Delete a theme via POST."""
    data = request.json or {}
    theme_slug = (data.get('slug') or '').strip().lower()
    if not theme_slug or theme_slug in RESERVED_SLUGS:
        return jsonify({'error': f'Cannot delete reserved theme: {theme_slug}'}), 400

    base_dir = os.path.dirname(os.path.abspath(__file__))
    theme_dir = os.path.join(app.static_folder, 'themes', theme_slug)
    dgx_theme_dir = os.path.join(base_dir, '..', 'dgx_photobooth', 'templates', 'themes', theme_slug)

    try:
        import shutil
        if os.path.exists(theme_dir):
            shutil.rmtree(theme_dir)
        if os.path.exists(dgx_theme_dir):
            shutil.rmtree(dgx_theme_dir)
        print(f"🗑️ [Studio] Deleted theme via POST: {theme_slug}")
        return jsonify({'status': 'success', 'message': f'Theme "{theme_slug}" deleted successfully'})
    except Exception as e:
        print(f"❌ Error deleting theme {theme_slug}: {e}")
        return jsonify({'error': f'Failed to delete theme: {str(e)}'}), 500


def load_master_data_index():
    """Build fast lookup map of master assets by id, code, and image filename."""
    master_file = os.path.join(app.static_folder, 'themes', 'master', 'data.json')
    lookup = {'clothes': {}, 'poses': {}, 'backgrounds': {}}
    if not os.path.exists(master_file):
        return lookup
    try:
        with open(master_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        for cat in ['clothes', 'poses', 'backgrounds']:
            for item in data.get(cat, []):
                item_id = item.get('id')
                code = item.get('code')
                img = item.get('image', '')
                slug = os.path.splitext(os.path.basename(img))[0]
                if item_id:
                    lookup[cat][item_id] = item
                if slug and slug != item_id:
                    lookup[cat][slug] = item
                if code and code not in lookup[cat]:
                    lookup[cat][code] = item
    except Exception as e:
        print(f"Error loading master index: {e}")
    return lookup


def resolve_theme_data(theme_slug):
    """Load theme data.json and resolve any master pointers into full asset objects."""
    data_file = os.path.join(app.static_folder, 'themes', theme_slug, 'data.json')
    if not os.path.exists(data_file):
        return {"poses": [], "clothes": [], "backgrounds": []}

    try:
        with open(data_file, 'r', encoding='utf-8') as f:
            theme_data = json.load(f)
    except Exception:
        return {"poses": [], "clothes": [], "backgrounds": []}

    if theme_slug == 'master':
        return theme_data

    master_index = load_master_data_index()
    resolved = {}

    for cat in ['clothes', 'poses', 'backgrounds']:
        resolved[cat] = []
        cat_index = master_index.get(cat, {})
        for idx, entry in enumerate(theme_data.get(cat, [])):
            if isinstance(entry, str):
                base_item = cat_index.get(entry, {})
                item = dict(base_item) if base_item else {"id": entry, "title": entry}
            elif isinstance(entry, dict):
                ref_id = entry.get('id') or entry.get('ref')
                base_item = cat_index.get(ref_id, {}) if ref_id else {}
                if not base_item and entry.get('code'):
                    base_item = cat_index.get(entry.get('code'), {})
                item = dict(base_item)
                item.update(entry)
            else:
                continue

            if not item.get('code'):
                prefix = 'C' if cat == 'clothes' else ('P' if cat == 'poses' else 'B')
                item['code'] = f"{prefix}{idx+1:02d}"

            if not item.get('prompt') and item.get('prompt_modifier'):
                item['prompt'] = item['prompt_modifier']
            if item.get('prompt'):
                try:
                    from asset_generator import sanitize_asset_prompt
                    item['prompt'] = sanitize_asset_prompt(item['prompt'], 'clothes' if cat == 'clothes' else ('pose' if cat == 'poses' else 'backdrop'))
                except Exception:
                    pass
            if item.get('prompt_modifier'):
                try:
                    from asset_generator import sanitize_asset_prompt
                    item['prompt_modifier'] = sanitize_asset_prompt(item['prompt_modifier'], 'clothes' if cat == 'clothes' else ('pose' if cat == 'poses' else 'backdrop'))
                except Exception:
                    pass
            if not item.get('title') and item.get('name'):
                item['title'] = item['name']
            if not item.get('description') and item.get('mapping_desc'):
                item['description'] = item['mapping_desc']

            resolved[cat].append(item)

    return resolved


@app.route('/api/theme/<theme_slug>/data')
def get_theme_data(theme_slug):
    """Serve resolved data.json for a given theme."""
    data_file = os.path.join(app.static_folder, 'themes', theme_slug, 'data.json')
    if not os.path.exists(data_file):
        return jsonify({"poses": [], "clothes": [], "backgrounds": []}), 200
    resolved = resolve_theme_data(theme_slug)
    return jsonify(resolved)


@app.route('/api/theme/<theme_slug>/samples')
@app.route('/api/<theme_slug>/samples')
def list_theme_samples(theme_slug):
    """Generic sample image lister for any theme's film strip."""
    samples_dir = os.path.join(app.static_folder, 'themes', theme_slug, 'images', 'samples')
    valid_ext = ('.png', '.jpg', '.jpeg', '.webp')
    images = []
    if os.path.exists(samples_dir):
        images = [f"/static/themes/{theme_slug}/images/samples/{img}" for img in os.listdir(samples_dir) if img.lower().endswith(valid_ext)]

    # Fallback 1: If samples_dir is empty, check theme's clothes images
    if not images:
        theme_clothes_dir = os.path.join(app.static_folder, 'themes', theme_slug, 'images', 'clothes')
        if os.path.exists(theme_clothes_dir):
            images = [f"/static/themes/{theme_slug}/images/clothes/{img}" for img in os.listdir(theme_clothes_dir) if img.lower().endswith(valid_ext)]

    # Fallback 2: Check theme's data.json for clothes images
    if not images:
        data_file = os.path.join(app.static_folder, 'themes', theme_slug, 'data.json')
        if os.path.exists(data_file):
            try:
                with open(data_file, 'r', encoding='utf-8') as f:
                    tdata = json.load(f)
                    for item in tdata.get('clothes', []):
                        img_path = item.get('image')
                        if img_path and img_path not in images:
                            images.append(img_path)
            except Exception:
                pass

    # Fallback 3: Master / UITS sample portraits
    if not images or len(images) < 6:
        uits_samples_dir = os.path.join(app.static_folder, 'themes', 'uits', 'images', 'samples')
        if os.path.exists(uits_samples_dir):
            uits_imgs = [f"/static/themes/uits/images/samples/{img}" for img in os.listdir(uits_samples_dir) if img.lower().endswith(valid_ext)]
            images = list(images) + [img for img in uits_imgs if img not in images]

    return jsonify(images)


@app.route('/static/themes/<theme_slug>/images/<category>/<filename>')
def serve_theme_image_fallback(theme_slug, category, filename):
    """Serve image from theme if present, otherwise fallback automatically to master."""
    theme_file = os.path.join(app.static_folder, 'themes', theme_slug, 'images', category, filename)
    if os.path.exists(theme_file):
        return send_file(theme_file)
    master_file = os.path.join(app.static_folder, 'themes', 'master', 'images', category, filename)
    if os.path.exists(master_file):
        return send_file(master_file)
    return "Image Not Found", 404


@app.route('/preview_draft')
def preview_draft():
    """Serve universal engine in temporary in-memory preview mode without creating files on disk."""
    engine_html = os.path.join(app.static_folder, 'engine', 'kiosk.html')
    if os.path.exists(engine_html):
        return send_from_directory(os.path.join(app.static_folder, 'engine'), 'kiosk.html')
    return "Universal Kiosk Engine Not Found", 404


@app.route('/guides')
@app.route('/guides/')
@app.route('/guides/<guide_name>')
@app.route('/guides/<guide_name>/')
@app.route('/guides/<guide_name>/<path:filename>')
def serve_guide_page(guide_name='theme-builder', filename='index.html'):
    """Serve embedded tutorial and walkthrough HTML guides, images, and video walkthroughs."""
    alias_map = {
        'theme-builder': 'theme-builder',
        'theme_builder': 'theme-builder',
        'theme-maker': 'theme-builder',
        'theme_maker': 'theme-builder',
        'theme maker guide': 'theme-builder',
        'theme_maker_guide': 'theme-builder',
        'theme': 'theme-builder',
        'themes': 'theme-builder',
        'comfy': 'comfyui',
        'comfyui': 'comfyui',
        'comfyui theme guide': 'comfyui',
        'comfyui_theme_guide': 'comfyui',
        'comfyui-theme-guide': 'comfyui',
        'prompt': 'comfyui',
        'prompt-studio': 'comfyui',
        'asset-creator': 'asset-creator',
        'asset_creator': 'asset-creator',
        'asset-builder': 'asset-creator',
        'asset_builder': 'asset-creator',
        'asset builder guide': 'asset-creator',
        'asset_builder_guide': 'asset-creator',
        'asset-builder-guide': 'asset-creator',
        'assets': 'asset-creator'
    }
    canonical = alias_map.get(guide_name.lower(), guide_name)
    guide_dir = os.path.join(app.static_folder, 'guides', canonical)
    if not os.path.exists(guide_dir):
        # Fallback to root Guides directory if available
        root_guide_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'Guides', guide_name)
        if os.path.exists(root_guide_dir):
            return send_from_directory(root_guide_dir, filename)
        return jsonify({'error': f'Guide "{guide_name}" not found'}), 404
    return send_from_directory(guide_dir, filename)


@app.route('/<theme_slug>')
def serve_theme(theme_slug):
    """Serve theme: custom index.html if present, otherwise Universal Engine."""
    if theme_slug in RESERVED_SLUGS:
        return "Not Found", 404
        
    use_engine_preview = request.args.get('engine') == 'universal'
    theme_dir = os.path.join(app.static_folder, 'themes', theme_slug)
    if not os.path.exists(theme_dir):
        if use_engine_preview:
            engine_html = os.path.join(app.static_folder, 'engine', 'kiosk.html')
            if os.path.exists(engine_html):
                return send_from_directory(os.path.join(app.static_folder, 'engine'), 'kiosk.html')
        return "Theme Not Found", 404
    custom_index = os.path.join(theme_dir, 'index.html')

    # PRIORITY 1: If custom index.html exists and not explicitly asking for universal engine, serve bespoke theme page
    if os.path.exists(custom_index) and not use_engine_preview:
        return send_from_directory(theme_dir, 'index.html')

    # PRIORITY 2: Universal Engine fallback for newly generated / studio themes or explicit preview
    engine_html = os.path.join(app.static_folder, 'engine', 'kiosk.html')
    if os.path.exists(engine_html):
        return send_from_directory(os.path.join(app.static_folder, 'engine'), 'kiosk.html')

    if os.path.exists(custom_index):
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



# ============================================================
# PRINT QUEUE FOR EDGE PRINT AGENTS (Direct Domain Mode)
# ============================================================
pending_print_jobs = {}


def add_to_print_queue(job_id, image_url):
    pending_print_jobs[job_id] = {
        'job_id': job_id,
        'image_url': image_url,
        'timestamp': time.time()
    }
    print(f"🖨️ [PrintQueue] Job {job_id} added to edge print queue (Pending: {len(pending_print_jobs)})")


@app.route('/api/print-queue/pending', methods=['GET'])
def get_pending_print_jobs():
    """Retrieve all pending print jobs for connected edge print agents."""
    return jsonify({
        'jobs': list(pending_print_jobs.values()),
        'count': len(pending_print_jobs)
    })


@app.route('/api/print-queue/ack/<job_id>', methods=['POST', 'GET'])
def ack_print_job(job_id):
    """Acknowledge that an edge print agent has printed the job."""
    if job_id in pending_print_jobs:
        del pending_print_jobs[job_id]
        print(f"✅ [PrintQueue] Job {job_id} acknowledged and removed from queue. Remaining: {len(pending_print_jobs)}")
        return jsonify({'status': 'success', 'message': f'Job {job_id} acknowledged'})
    return jsonify({'status': 'not_found', 'message': f'Job {job_id} not in pending queue'}), 404


@app.route('/api/print/<job_id>', methods=['GET'])
def print_image(job_id):
    """Trigger print dialog locally or queue for remote edge print agents"""
    if job_id not in jobs:
        return jsonify({'error': 'Job not found'}), 404
    
    job = jobs[job_id]
    if job['status'] != 'completed':
        return jsonify({'error': 'Image not ready'}), 400
    
    output_file = job.get('output_file')
    if not output_file or not os.path.exists(output_file):
        return jsonify({'error': 'Output file not found'}), 404
    
    abs_path = os.path.abspath(output_file)

    # 1. Enqueue job for any edge print agents (Direct Domain / Remote Laptop mode)
    image_rel_url = f"/outputs/{os.path.basename(output_file)}"
    add_to_print_queue(job_id, image_rel_url)

    # 2. Also attempt direct local OS print if running on an edge device with a printer
    def run_print_job(path):
        try:
            current_os = platform.system()
            if current_os == "Windows":
                print(f"🖨️ [Local Print] Dispatching to Windows spooler: {path}")
                os.startfile(path, "print")
            elif current_os in ["Linux", "Darwin"]:
                # Only attempt lp/lpr if lp command exists on this machine
                import shutil
                if shutil.which('lp'):
                    cmd = ['lp', '-o', 'fit-to-page', path]
                    subprocess.run(cmd, capture_output=True, text=True)
        except Exception as e:
            # Non-fatal if server is purely remote/headless DGX
            print(f"Notice: Local print dispatch skipped or failed (expected on headless DGX): {e}")

    thread = threading.Thread(target=run_print_job, args=(abs_path,))
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'status': 'sent_to_printer',
        'message': 'Print job queued and initiated',
        'job_id': job_id,
        'image_url': image_rel_url
    }), 200


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
# THEME STUDIO ADMIN ACCESS & AUTH
# ============================================================
@app.route('/api/admin/auth-status', methods=['GET'])
def admin_auth_status():
    """Check if the current session has authenticated access to Theme Studio."""
    return jsonify({
        'authenticated': bool(session.get('admin_authenticated')),
        'configured_file': 'kiosk_frontend/config.py'
    })


@app.route('/api/admin/login', methods=['POST'])
def api_admin_login():
    """Verify admin password and create authenticated session."""
    data = request.json or {}
    password = data.get('password', '')
    if password == THEME_STUDIO_PASSWORD:
        session['admin_authenticated'] = True
        session.permanent = False
        return jsonify({'success': True, 'redirect': '/admin'})
    return jsonify({
        'success': False,
        'error': 'Incorrect password. Check or change THEME_STUDIO_PASSWORD in kiosk_frontend/config.py'
    }), 401


@app.route('/admin/login', methods=['GET', 'POST'])
def admin_login():
    """Serve the Theme Studio login page or handle direct form submission."""
    if session.get('admin_authenticated'):
        return redirect('/admin')

    if request.method == 'POST':
        password = request.form.get('password', '')
        if password == THEME_STUDIO_PASSWORD:
            session['admin_authenticated'] = True
            session.permanent = False
            return redirect('/admin')
        return redirect('/admin/login?error=1')

    admin_dir = os.path.join(app.static_folder, 'admin')
    return send_from_directory(admin_dir, 'login.html')


@app.route('/admin/logout')
@app.route('/api/admin/logout', methods=['GET', 'POST'])
def admin_logout():
    """Lock Theme Studio by clearing the admin session."""
    session.pop('admin_authenticated', None)
    if request.path.startswith('/api/'):
        return jsonify({'success': True, 'message': 'Logged out successfully'})
    return redirect('/')


@app.before_request
def protect_admin_api_routes():
    """Ensure all /api/admin/* mutation & inspection endpoints require authentication."""
    public_admin_routes = {
        '/api/admin/auth-status',
        '/api/admin/login',
        '/api/admin/logout'
    }
    if request.path.startswith('/api/admin/'):
        if request.path not in public_admin_routes:
            if not session.get('admin_authenticated'):
                return jsonify({
                    'error': 'Unauthorized: Admin password required to access Theme Studio.',
                    'auth_required': True
                }), 401


# ============================================================
# THEME STUDIO ADMIN ROUTES
# ============================================================
from workflow_inspector import inspect_kiosk_workflow, inspect_video_workflow

@app.route('/admin')
def admin_panel():
    """Serve the Theme Studio Admin SPA if authenticated; otherwise redirect to login."""
    if not session.get('admin_authenticated'):
        return redirect('/admin/login')
    admin_dir = os.path.join(app.static_folder, 'admin')
    return send_from_directory(admin_dir, 'index.html')


@app.route('/api/admin/assets')
def get_master_assets():
    """Return a master catalog of all clothes, poses, and backgrounds from master repository and themes."""
    catalog = {
        'clothes': [],
        'poses': [],
        'backgrounds': []
    }
    master_data = resolve_theme_data('master')
    seen_ids = {'clothes': set(), 'poses': set(), 'backgrounds': set()}
    seen_images = {'clothes': set(), 'poses': set(), 'backgrounds': set()}

    for cat in ['clothes', 'poses', 'backgrounds']:
        for item in master_data.get(cat, []):
            item_id = item.get('id')
            img_path = item.get('image', '')
            if item_id:
                seen_ids[cat].add(item_id)
            if img_path:
                seen_images[cat].add(img_path.strip().lower())
            entry = dict(item)
            entry['source_theme'] = 'master'
            catalog[cat].append(entry)

    # Also include any custom theme items
    themes_dir = os.path.join(app.static_folder, 'themes')
    if os.path.exists(themes_dir):
        for theme_slug in sorted(os.listdir(themes_dir)):
            if theme_slug in RESERVED_SLUGS or theme_slug == 'master':
                continue
            theme_resolved = resolve_theme_data(theme_slug)
            for cat in ['clothes', 'poses', 'backgrounds']:
                for item in theme_resolved.get(cat, []):
                    item_id = item.get('id')
                    img_path = (item.get('image') or '').strip().lower()
                    if item_id and item_id in seen_ids[cat]:
                        continue
                    if img_path and img_path in seen_images[cat]:
                        continue
                    if item_id:
                        seen_ids[cat].add(item_id)
                    if img_path:
                        seen_images[cat].add(img_path)
                    entry = dict(item)
                    entry['source_theme'] = theme_slug
                    catalog[cat].append(entry)

    return jsonify(catalog)


@app.route('/api/admin/asset/delete', methods=['POST'])
def admin_delete_asset():
    """Permanently delete an asset from the master library data.json and disk."""
    try:
        data = request.json or {}
        category = data.get('category')  # 'clothes', 'poses', 'backgrounds'
        asset_id = data.get('id')
        image_path = data.get('image', '')

        if category not in ['clothes', 'poses', 'backgrounds']:
            return jsonify({'error': f'Invalid category: {category}'}), 400

        base_dir = os.path.dirname(os.path.abspath(__file__))
        master_data_path = os.path.join(base_dir, 'static', 'themes', 'master', 'data.json')
        if not os.path.exists(master_data_path):
            return jsonify({'error': 'Master data.json not found'}), 404

        with open(master_data_path, 'r', encoding='utf-8') as f:
            master_data = json.load(f)

        original_list = master_data.get(category, [])
        new_list = []
        deleted_item = None

        clean_img_name = os.path.basename(image_path) if image_path else ''
        for item in original_list:
            match_id = asset_id and item.get('id') == asset_id
            match_img = image_path and item.get('image') == image_path
            match_img_base = clean_img_name and os.path.basename(item.get('image', '')) == clean_img_name
            if (match_id or match_img or match_img_base) and not deleted_item:
                deleted_item = item
            else:
                new_list.append(item)

        master_data[category] = new_list

        with open(master_data_path, 'w', encoding='utf-8') as f:
            json.dump(master_data, f, indent=2, ensure_ascii=False)

        # Remove image file if stored in master theme
        if deleted_item and deleted_item.get('image'):
            img_rel = deleted_item['image'].lstrip('/')
            full_img_path = os.path.join(base_dir, img_rel)
            if os.path.exists(full_img_path) and 'master' in img_rel:
                try:
                    os.remove(full_img_path)
                except Exception as e:
                    print(f"Notice: Could not remove image file {full_img_path}: {e}")

        # If clothes, clean up clothes_mapping.json
        if category == 'clothes' and deleted_item and deleted_item.get('code'):
            code = deleted_item['code']
            for m_dir in [
                os.path.join(base_dir, 'static', 'themes', 'master'),
                os.path.join(base_dir, '..', 'dgx_photobooth', 'templates', 'themes', 'master')
            ]:
                m_path = os.path.join(m_dir, 'clothes_mapping.json')
                if os.path.exists(m_path):
                    try:
                        with open(m_path, 'r', encoding='utf-8') as mf:
                            m_data = json.load(mf)
                        if code in m_data:
                            del m_data[code]
                            with open(m_path, 'w', encoding='utf-8') as mf:
                                json.dump(m_data, mf, indent=2, ensure_ascii=False)
                    except Exception:
                        pass

        # Also remove from all installed themes data.json to prevent resurrection / stale references
        del_id = (deleted_item.get('id') if deleted_item else asset_id) or ''
        del_img = (deleted_item.get('image') if deleted_item else image_path) or ''
        themes_dir = os.path.join(base_dir, 'static', 'themes')
        if os.path.exists(themes_dir):
            for t_slug in os.listdir(themes_dir):
                if t_slug in RESERVED_SLUGS:
                    continue
                t_data_path = os.path.join(themes_dir, t_slug, 'data.json')
                if os.path.exists(t_data_path):
                    try:
                        with open(t_data_path, 'r', encoding='utf-8') as tf:
                            t_data = json.load(tf)
                        t_cat_list = t_data.get(category, [])
                        t_new_list = []
                        for entry in t_cat_list:
                            if isinstance(entry, str):
                                if entry == del_id:
                                    continue
                            elif isinstance(entry, dict):
                                e_id = entry.get('id') or ''
                                e_img = entry.get('image') or ''
                                if (del_id and e_id == del_id) or (del_img and e_img == del_img):
                                    continue
                            t_new_list.append(entry)
                        if len(t_new_list) != len(t_cat_list):
                            t_data[category] = t_new_list
                            with open(t_data_path, 'w', encoding='utf-8') as tf:
                                json.dump(t_data, tf, indent=2, ensure_ascii=False)
                    except Exception as te:
                        print(f"Notice: Could not clean theme {t_slug} data.json: {te}")

        print(f"🗑️ [Studio] Deleted asset from library ({category}): {deleted_item.get('title') if deleted_item else asset_id}")
        return jsonify({
            'status': 'success',
            'category': category,
            'remaining_count': len(new_list),
            'deleted_item': deleted_item
        })
    except Exception as e:
        print(f"❌ [Studio] Error deleting asset: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/asset/update', methods=['POST'])
def admin_update_asset():
    """Update descriptor metadata for an asset in master library and sync installed themes."""
    try:
        data = request.json or {}
        category = data.get('category')  # 'clothes', 'poses', 'backgrounds'
        asset_id = data.get('id')
        original_image = data.get('original_image', '') or data.get('image', '')

        title = (data.get('title') or '').strip()
        code = (data.get('code') or '').strip()
        description = (data.get('description') or '').strip()
        lighting = (data.get('lighting') or '').strip()
        prompt = (data.get('prompt') or '').strip()
        gender = (data.get('gender') or data.get('category_gender') or '').strip()

        if category not in ['clothes', 'poses', 'backgrounds']:
            return jsonify({'error': f'Invalid category: {category}'}), 400

        base_dir = os.path.dirname(os.path.abspath(__file__))
        master_data_path = os.path.join(base_dir, 'static', 'themes', 'master', 'data.json')
        if not os.path.exists(master_data_path):
            return jsonify({'error': 'Master data.json not found'}), 404

        with open(master_data_path, 'r', encoding='utf-8') as f:
            master_data = json.load(f)

        original_list = master_data.get(category, [])
        updated_item = None
        clean_img_name = os.path.basename(original_image) if original_image else ''

        for item in original_list:
            match_id = asset_id and item.get('id') == asset_id
            match_img = original_image and item.get('image') == original_image
            match_img_base = clean_img_name and os.path.basename(item.get('image', '')) == clean_img_name
            if match_id or match_img or match_img_base:
                if title:
                    item['title'] = title
                    item['name'] = title
                if code:
                    item['code'] = code
                if description:
                    item['description'] = description
                    item['mapping_desc'] = description
                if lighting:
                    item['lighting'] = lighting
                if prompt:
                    item['prompt'] = prompt
                    item['prompt_modifier'] = prompt
                if category == 'clothes' and gender:
                    item['category'] = gender
                    item['gender'] = gender
                updated_item = item
                break

        if not updated_item:
            return jsonify({'error': 'Asset not found in master library'}), 404

        with open(master_data_path, 'w', encoding='utf-8') as f:
            json.dump(master_data, f, indent=2, ensure_ascii=False)

        # Update clothes_mapping.json if clothes
        if category == 'clothes' and updated_item.get('code'):
            c_code = updated_item['code']
            mapping_text = updated_item.get('mapping_desc') or updated_item.get('description') or updated_item.get('title')
            for m_dir in [
                os.path.join(base_dir, 'static', 'themes', 'master'),
                os.path.join(base_dir, '..', 'dgx_photobooth', 'templates', 'themes', 'master')
            ]:
                m_path = os.path.join(m_dir, 'clothes_mapping.json')
                if os.path.exists(m_path):
                    try:
                        with open(m_path, 'r', encoding='utf-8') as mf:
                            m_data = json.load(mf)
                        m_data[c_code] = mapping_text
                        with open(m_path, 'w', encoding='utf-8') as mf:
                            json.dump(m_data, mf, indent=2, ensure_ascii=False)
                    except Exception:
                        pass

        # Also sync to installed themes data.json if they reference this asset
        themes_dir = os.path.join(base_dir, 'static', 'themes')
        if os.path.exists(themes_dir):
            for t_slug in os.listdir(themes_dir):
                if t_slug in RESERVED_SLUGS:
                    continue
                t_data_path = os.path.join(themes_dir, t_slug, 'data.json')
                if os.path.exists(t_data_path):
                    try:
                        with open(t_data_path, 'r', encoding='utf-8') as tf:
                            t_data = json.load(tf)
                        t_changed = False
                        for t_item in t_data.get(category, []):
                            if not isinstance(t_item, dict):
                                continue
                            m_id = asset_id and t_item.get('id') == asset_id
                            m_img = original_image and t_item.get('image') == original_image
                            m_base = clean_img_name and os.path.basename(t_item.get('image', '')) == clean_img_name
                            if m_id or m_img or m_base:
                                if title:
                                    t_item['title'] = title
                                    t_item['name'] = title
                                if code:
                                    t_item['code'] = code
                                if description:
                                    t_item['description'] = description
                                    t_item['mapping_desc'] = description
                                if lighting:
                                    t_item['lighting'] = lighting
                                if prompt:
                                    t_item['prompt'] = prompt
                                    t_item['prompt_modifier'] = prompt
                                if category == 'clothes' and gender:
                                    t_item['category'] = gender
                                    t_item['gender'] = gender
                                t_changed = True
                        if t_changed:
                            with open(t_data_path, 'w', encoding='utf-8') as tf:
                                json.dump(t_data, tf, indent=2, ensure_ascii=False)
                    except Exception as te:
                        print(f"Notice: Could not sync updated asset to theme {t_slug}: {te}")

        print(f"✏️ [Studio] Updated asset descriptors ({category}): {updated_item.get('title')}")
        return jsonify({'status': 'success', 'asset': updated_item})
    except Exception as e:
        print(f"❌ [Studio] Error updating asset: {e}")
        return jsonify({'error': str(e)}), 500


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

        # Ensure sample portraits exist for rolling film strip
        target_samples_dir = os.path.join(theme_dir, 'images', 'samples')
        if os.path.exists(target_samples_dir) and not os.listdir(target_samples_dir):
            uits_samples_dir = os.path.join(base_dir, 'static', 'themes', 'uits', 'images', 'samples')
            if os.path.exists(uits_samples_dir):
                import shutil
                for sfile in os.listdir(uits_samples_dir):
                    if sfile.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                        try:
                            shutil.copyfile(os.path.join(uits_samples_dir, sfile), os.path.join(target_samples_dir, sfile))
                        except Exception as ce:
                            print(f"Notice: Could not copy sample image: {ce}")

        # 1. Save theme.json
        theme_json_path = os.path.join(theme_dir, 'theme.json')
        with open(theme_json_path, 'w', encoding='utf-8') as f:
            json.dump(theme_cfg, f, indent=2, ensure_ascii=False)

        # 2. Save data.json
        data_json_path = os.path.join(theme_dir, 'data.json')
        with open(data_json_path, 'w', encoding='utf-8') as f:
            json.dump(asset_data, f, indent=2, ensure_ascii=False)

        # 3. Save bindings.json (always ensure nodes are bound)
        if not bindings or not isinstance(bindings, dict):
            from workflow_inspector import load_theme_bindings
            bindings = load_theme_bindings(theme_dir)
        
        # Populate defaults for any unbound photobooth nodes
        defaults = {
            "input_image_node": "65",
            "prompt_node": "45",
            "sampler_node": "44",
            "face_swap_node": "57",
            "output_node": "60"
        }
        for k, def_val in defaults.items():
            if not bindings.get(k):
                bindings[k] = def_val
        if not bindings.get("confidence"):
            bindings["confidence"] = "high"

        bindings_path = os.path.join(theme_dir, 'bindings.json')
        with open(bindings_path, 'w', encoding='utf-8') as f:
            json.dump(bindings, f, indent=2)

        # 4. Save workflow_kiosk.json if uploaded
        if workflow:
            wf_path = os.path.join(theme_dir, 'workflow_kiosk.json')
            with open(wf_path, 'w', encoding='utf-8') as f:
                json.dump(workflow, f, indent=2)

        # 4b. Sync prompt formula to workflow files (Node 45)
        prompt_tpl = theme_cfg.get('promptTemplate', {})
        raw_prompt = prompt_tpl.get('rawPrompt')
        if raw_prompt:
            p_node = (bindings or {}).get('prompt_node', '45')
            wf_candidates = [f for f in os.listdir(theme_dir) if f.endswith('.json') and ('ZIT' in f or 'workflow' in f.lower()) and f not in ['bindings.json', 'data.json', 'theme.json', 'clothes_mapping.json']]
            
            # If no workflow file exists, create workflow_kiosk.json from UITS template
            if not wf_candidates and not workflow:
                uits_wf = os.path.join(base_dir, 'static', 'themes', 'uits', 'ZIT_FaceSwapAPI(uits).json')
                if os.path.exists(uits_wf):
                    import shutil
                    target_wf = os.path.join(theme_dir, 'workflow_kiosk.json')
                    try:
                        shutil.copyfile(uits_wf, target_wf)
                        wf_candidates = ['workflow_kiosk.json']
                    except Exception as ce:
                        print(f"Notice: Could not copy template workflow: {ce}")

            for wf_file in wf_candidates:
                full_wf_path = os.path.join(theme_dir, wf_file)
                try:
                    with open(full_wf_path, 'r', encoding='utf-8') as wff:
                        wf_obj = json.load(wff)
                    node_id = str(p_node)
                    if node_id in wf_obj and 'inputs' in wf_obj[node_id] and 'text' in wf_obj[node_id]['inputs']:
                        wf_obj[node_id]['inputs']['text'] = raw_prompt
                    else:
                        for nid, ndata in wf_obj.items():
                            if isinstance(ndata, dict) and ndata.get('class_type') == 'CLIPTextEncode' and 'text' in ndata.get('inputs', {}):
                                ndata['inputs']['text'] = raw_prompt
                                break
                    with open(full_wf_path, 'w', encoding='utf-8') as wff:
                        json.dump(wf_obj, wff, indent=2, ensure_ascii=False)
                    print(f"✅ [Studio] Synced prompt formula to workflow: {wf_file}")
                except Exception as we:
                    print(f"Warning: Could not update prompt in {wf_file}: {we}")


        # 5. Sync clothes_mapping.json for FLF workflow across theme and master
        theme_mapping = {}
        for item in asset_data.get('clothes', []):
            code = item.get('code')
            if code:
                theme_mapping[code] = {
                    'desc': item.get('mapping_desc') or item.get('description', '') or item.get('title', ''),
                    'lighting': item.get('lighting', 'Warm cinematic lighting')
                }

        # Write to theme dir & dgx theme dir
        with open(os.path.join(theme_dir, 'clothes_mapping.json'), 'w', encoding='utf-8') as f:
            json.dump(theme_mapping, f, indent=2, ensure_ascii=False)
        dgx_mapping_path = os.path.join(dgx_theme_dir, 'clothes_mapping.json')
        with open(dgx_mapping_path, 'w', encoding='utf-8') as f:
            json.dump(theme_mapping, f, indent=2, ensure_ascii=False)

        # Merge into master clothes mappings
        for m_dir in [
            os.path.join(base_dir, 'static', 'themes', 'master'),
            os.path.join(base_dir, '..', 'dgx_photobooth', 'templates', 'themes', 'master')
        ]:
            os.makedirs(m_dir, exist_ok=True)
            m_path = os.path.join(m_dir, 'clothes_mapping.json')
            m_data = {}
            if os.path.exists(m_path):
                try:
                    with open(m_path, 'r', encoding='utf-8') as mf:
                        m_data = json.load(mf)
                except Exception:
                    pass
            m_data.update(theme_mapping)
            with open(m_path, 'w', encoding='utf-8') as mf:
                json.dump(m_data, mf, indent=2, ensure_ascii=False)

        # 6. Save custom atmosphere decorations.html and style.css if provided
        decorations_html = payload.get('decorations_html')
        custom_css = payload.get('custom_css')
        if decorations_html is not None:
            deco_path = os.path.join(theme_dir, 'decorations.html')
            with open(deco_path, 'w', encoding='utf-8') as f:
                f.write(decorations_html)
            print(f"✅ [Studio] Saved custom decorations.html for theme: {slug}")
        if custom_css is not None:
            css_path = os.path.join(theme_dir, 'style.css')
            with open(css_path, 'w', encoding='utf-8') as f:
                f.write(custom_css)
            print(f"✅ [Studio] Saved custom style.css for theme: {slug}")

        print(f"✅ [Studio] Successfully saved theme package and FLF clothes mapping for: '{slug}'")
        return jsonify({
            'status': 'success',
            'slug': slug,
            'message': f'Theme "{theme_cfg.get("title")}" published successfully'
        }), 200

    except Exception as e:
        print(f"❌ [Studio] Error saving theme: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/theme/<theme_slug>/atmosphere', methods=['GET', 'POST'])
def admin_theme_atmosphere(theme_slug):
    """Get or save custom decorations.html and style.css for a theme."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    theme_slug_clean = theme_slug.strip().lower()
    theme_dir = os.path.join(base_dir, 'static', 'themes', theme_slug_clean)

    if request.method == 'POST':
        # If theme directory does not exist yet (e.g. creating/testing a draft theme),
        # initialize directory and base scaffold so compile/preview works smoothly
        if not os.path.exists(theme_dir):
            os.makedirs(theme_dir, exist_ok=True)
            for subdir in ['images/clothes', 'images/poses', 'images/backgrounds', 'images/samples']:
                os.makedirs(os.path.join(theme_dir, subdir), exist_ok=True)

            # Copy sample portraits from uits for rolling film strip
            target_samples_dir = os.path.join(theme_dir, 'images', 'samples')
            uits_samples_dir = os.path.join(base_dir, 'static', 'themes', 'uits', 'images', 'samples')
            if os.path.exists(uits_samples_dir) and not os.listdir(target_samples_dir):
                import shutil
                for sfile in os.listdir(uits_samples_dir):
                    if sfile.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                        try:
                            shutil.copyfile(os.path.join(uits_samples_dir, sfile), os.path.join(target_samples_dir, sfile))
                        except Exception:
                            pass

            # Create fallback theme.json if missing
            theme_json_path = os.path.join(theme_dir, 'theme.json')
            if not os.path.exists(theme_json_path):
                with open(theme_json_path, 'w', encoding='utf-8') as f:
                    json.dump({
                        'slug': theme_slug_clean,
                        'title': theme_slug_clean.replace('_', ' ').title(),
                        'status': 'draft',
                        'atmosphereMode': 'advanced'
                    }, f, indent=2)

            # Create fallback data.json if missing
            data_json_path = os.path.join(theme_dir, 'data.json')
            if not os.path.exists(data_json_path):
                with open(data_json_path, 'w', encoding='utf-8') as f:
                    json.dump({'clothes': [], 'poses': [], 'backgrounds': []}, f, indent=2)

        deco_path = os.path.join(theme_dir, 'decorations.html')
        css_path = os.path.join(theme_dir, 'style.css')
        payload = request.json or {}
        deco_content = payload.get('decorations_html', '')
        css_content = payload.get('custom_css', '')
        try:
            with open(deco_path, 'w', encoding='utf-8') as f:
                f.write(deco_content)
            with open(css_path, 'w', encoding='utf-8') as f:
                f.write(css_content)
            return jsonify({'status': 'success', 'message': 'Atmosphere files saved successfully'})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    # GET request
    if not os.path.exists(theme_dir):
        return jsonify({
            'status': 'success',
            'theme': theme_slug_clean,
            'decorations_html': '',
            'custom_css': ''
        })

    deco_path = os.path.join(theme_dir, 'decorations.html')
    css_path = os.path.join(theme_dir, 'style.css')
    deco_content = ""
    css_content = ""
    if os.path.exists(deco_path):
        try:
            with open(deco_path, 'r', encoding='utf-8') as f:
                deco_content = f.read()
        except Exception:
            pass
    if os.path.exists(css_path):
        try:
            with open(css_path, 'r', encoding='utf-8') as f:
                css_content = f.read()
        except Exception:
            pass

    return jsonify({
        'status': 'success',
        'theme': theme_slug_clean,
        'decorations_html': deco_content,
        'custom_css': css_content
    })


# ============================================================
# AI ASSET GENERATOR ROUTES (Backdrop, Clothes, Pose)
# ============================================================
from asset_generator import get_template_configs, generate_asset_image, accept_and_store_asset

@app.route('/api/admin/asset-generator/config')
def admin_asset_generator_config():
    """Return prefix, suffix, and default middle prompt for each asset generator."""
    return jsonify({
        'status': 'success',
        'templates': get_template_configs()
    })


@app.route('/api/admin/asset-generator/generate', methods=['POST'])
def admin_asset_generator_generate():
    """Generate an asset preview with ComfyUI from middle prompt variable."""
    try:
        data = request.json or {}
        asset_type = data.get('type', 'backdrop')
        description = data.get('description', '')
        gender = data.get('gender', 'female')
        seed = data.get('seed')
        if seed is not None:
            try:
                seed = int(seed)
            except ValueError:
                seed = None

        if not description.strip():
            return jsonify({'error': 'Please provide a description for the asset'}), 400

        result = generate_asset_image(asset_type, description, gender=gender, seed=seed)
        if not result.get('success'):
            return jsonify({'error': result.get('error', 'Generation failed')}), 500

        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/asset-generator/accept', methods=['POST'])
def admin_asset_generator_accept():
    """Accept and store preview image permanently into the target theme."""
    try:
        data = request.json or {}
        preview_filename = data.get('preview_filename')
        asset_type = data.get('type', 'backdrop')
        asset_name = data.get('name', '').strip()
        description = data.get('description', '').strip()
        target_theme = data.get('target_theme', 'master')
        prompt_desc = data.get('prompt_desc', '')
        gender = data.get('gender', 'unisex')

        if not preview_filename:
            return jsonify({'error': 'Missing preview_filename'}), 400

        res = accept_and_store_asset(
            preview_filename=preview_filename,
            asset_type=asset_type,
            asset_name=asset_name,
            target_theme=target_theme,
            prompt_desc=prompt_desc,
            gender=gender,
            description=description
        )
        if not res.get('success'):
            return jsonify({'error': res.get('error', 'Failed to store asset')}), 500

        return jsonify(res)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def auto_heal_theme_data_files():
    """
    Auto-heal any existing theme data.json files (and master data.json) created
    with legacy asset generator code that baked studio prefixes/suffixes into prompts.
    """
    try:
        from asset_generator import sanitize_asset_prompt
        themes_dir = os.path.join(app.static_folder, 'themes')
        if not os.path.exists(themes_dir):
            return

        for theme_slug in os.listdir(themes_dir):
            t_dir = os.path.join(themes_dir, theme_slug)
            if not os.path.isdir(t_dir):
                continue
            data_path = os.path.join(t_dir, 'data.json')
            if not os.path.exists(data_path):
                continue
            try:
                with open(data_path, 'r', encoding='utf-8') as f:
                    d = json.load(f)
                changed = False
                for cat, asset_type in [('clothes', 'clothes'), ('poses', 'pose'), ('backgrounds', 'backdrop')]:
                    for item in d.get(cat, []):
                        if not isinstance(item, dict):
                            continue
                        for p_key in ['prompt', 'prompt_modifier']:
                            val = item.get(p_key)
                            if val:
                                cleaned = sanitize_asset_prompt(val, asset_type)
                                if cleaned != val:
                                    item[p_key] = cleaned
                                    changed = True
                if changed:
                    with open(data_path, 'w', encoding='utf-8') as f:
                        json.dump(d, f, indent=2, ensure_ascii=False)
                    print(f"✨ [AutoHeal] Automatically scrubbed legacy prompt boilerplate in: {theme_slug}/data.json")
            except Exception as e:
                print(f"⚠️ [AutoHeal] Notice: could not check {data_path}: {e}")
    except Exception as ge:
        print(f"⚠️ [AutoHeal] Skipping auto-heal check: {ge}")


# Run once on server startup
auto_heal_theme_data_files()

if __name__ == '__main__':
    print("SEIT 4D Vision Studio - Starting...")
    print_config()
    print("Open your browser to: http://localhost:5000")
    print("NOTE: If accessing from another device (e.g., http://192.168.x.x:5000),")
    print("  camera access will be BLOCKED by browsers unless you use HTTPS.")
    print("  Solution: Use 'chrome://flags/#unsafely-treat-insecure-origin-as-secure'")
    print("Make sure ComfyUI is running on 127.0.0.1:8188")
    app.run(debug=True, host='0.0.0.0', port=5000)
