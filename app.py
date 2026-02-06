from flask import Flask, render_template, request, jsonify, send_file
from flask_cors import CORS
import os
import uuid
import threading
from datetime import datetime
import base64
from comfy_processor import process_image
from face_analysis import generate_lucky_number_from_face


app = Flask(__name__, static_folder='static', template_folder='static')
CORS(app)

# Store job status in memory (for production, use Redis or database)
jobs = {}

# Configuration
UPLOAD_FOLDER = 'uploads'
OUTPUT_FOLDER = 'outputs'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)


def process_image_async(job_id, input_path, gender='female', pose='', clothes_style='', background='', enable_lucky_number=True):
    """Process image in background thread"""
    try:
        jobs[job_id]['status'] = 'processing'
        jobs[job_id]['message'] = 'Analyzing facial geometry...'
    
        try:
             # Run face analysis first for the visualizer
             # We run it regardless of enable_lucky_number if we want to show stats,
             # but let's stick to only if enabled or always? Let's do always for the "cool factor" unless it crashes.
             # But wait, generated lucky number is only used if enabled.
             # Let's run it.
             _, measurements = generate_lucky_number_from_face(input_path)
             if measurements:
                 jobs[job_id]['analytics'] = measurements
                 jobs[job_id]['message'] = 'Designing your new look...'
        except Exception as e:
            print(f"Analysis failed (non-fatal): {e}")

        # Call the ComfyUI processor with all parameters
        success, output_file, error = process_image(
            input_path, 
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
def index():
    """Serve the main HTML page"""
    return render_template('index.html')


@app.route('/api/process', methods=['POST'])
def process():
    """Handle image upload and start processing"""
    try:
        # Get image from request
        if 'image' not in request.files:
            return jsonify({'error': 'No image provided'}), 400
        
        image_file = request.files['image']
        
        # Get all selection parameters
        gender = request.form.get('gender', 'female')
        pose = request.form.get('pose', '')
        clothes_style = request.form.get('clothes_style', '')
        background = request.form.get('background', '')
        enable_lucky_number = request.form.get('enable_lucky_number', 'true').lower() == 'true'
        
        print(f"Received selections:")
        print(f"  Gender: {gender}")
        print(f"  Pose: {pose[:50]}..." if len(pose) > 50 else f"  Pose: {pose}")
        print(f"  Clothes: {clothes_style[:50]}..." if len(clothes_style) > 50 else f"  Clothes: {clothes_style}")
        print(f"  Background: {background[:50]}..." if len(background) > 50 else f"  Background: {background}")
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
            'gender': gender,
            'pose': pose,
            'clothes_style': clothes_style,
            'background': background,
            'enable_lucky_number': enable_lucky_number
        }
        
        # Start processing in background thread
        thread = threading.Thread(target=process_image_async, args=(job_id, input_path, gender, pose, clothes_style, background, enable_lucky_number))
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
    
    try:
        abs_path = os.path.abspath(output_file)
        print(f"Printing file: {abs_path}")
        # 'print' verb works on Windows to open the default print dialog/action
        os.startfile(abs_path, "print")
        return jsonify({'status': 'sent_to_printer', 'message': 'Print job initiated on server'}), 200
    except Exception as e:
        print(f"Print error: {e}")
        return jsonify({'error': f"Failed to print: {str(e)}"}), 500


if __name__ == '__main__':
    print("🎊 CNY Photo Booth Server Starting...")
    print("📸 Open your browser to: http://localhost:5000")
    print("⚠️  NOTE: If accessing from another device (e.g., http://192.168.x.x:5000),")
    print("    camera access will be BLOCKED by browsers unless you use HTTPS.")
    print("    Solution: Use 'chrome://flags/#unsafely-treat-insecure-origin-as-secure'")
    print("🚀 Make sure ComfyUI is running on 127.0.0.1:8188")
    app.run(debug=True, host='0.0.0.0', port=5000)
