import json
import os
import random
import urllib.request
import base64
import io
from PIL import Image
import websocket
from face_analysis import generate_lucky_number_from_face

# Configuration
from config import COMFY_SERVER_ADDRESS
server_address = COMFY_SERVER_ADDRESS

def load_workflow(filename):
    with open(filename, 'r', encoding='utf-8') as file:
        return json.load(file)

def encode_image_to_base64(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def update_workflow_with_image(workflow, image_path, gender="female", pose="", clothes_style="", background=""):
    """Update workflow with uploaded image and all user selections"""
    base64_image = encode_image_to_base64(image_path)
    workflow["65"]["inputs"]["base64_data"] = base64_image
    
    # New logic for gender_style
    gender_style = "executive leading man" if gender.lower() == "male" else "charismatic k-pop idol"

    # Update prompt text with all variables
    current_text = workflow["45"]["inputs"]["text"]
    current_text = current_text.replace('"gender"', gender)
    current_text = current_text.replace('"gender_style"', gender_style)
    current_text = current_text.replace('"pose"', pose)
    current_text = current_text.replace('"clothes_style"', clothes_style)
    current_text = current_text.replace('"background"', background)
    workflow["45"]["inputs"]["text"] = current_text
    
    # Update gender detection fields (lines 144, 145)
    workflow["57"]["inputs"]["detect_gender_input"] = "no"
    workflow["57"]["inputs"]["detect_gender_source"] = "no"
    
    return workflow

def update_workflow_with_lucky_number(workflow, enable_lucky_number=True, image_path=None):

    """Update workflow with lucky number text or empty string"""
    
    # Chinese New Year Blessings
    blessings_phrases = [
        "祝你马到成功", 
        "祝你龙马精神", 
        "祝你马年大吉", 
        "祝你策马奔腾"
    ]
    selected_blessing = random.choice(blessings_phrases)

    if enable_lucky_number:
        if image_path:
            lucky_num_str, _ = generate_lucky_number_from_face(image_path)
            print(f"Generated lucky number from face: {lucky_num_str}")
        else:
            lucky_num_int = random.randint(0000, 9999)
            lucky_num_str = f"{lucky_num_int:04}"
            print(f"Generated random lucky number (fallback): {lucky_num_str}")
            
        # Combine Lucky Number and Blessing (Attempting to position blessing below)
        lucky_text = f'Centered at the bottom is the elegant text "Lucky Number: {lucky_num_str}" and below it is the text "{selected_blessing}".'
    else:
        lucky_text = f'Centered at the bottom is the elegant text "{selected_blessing}".'
        print(f"Lucky number disabled, using blessing: {lucky_text}")
    
    current_text = workflow["45"]["inputs"]["text"]
    workflow["45"]["inputs"]["text"] = current_text.replace('"lucky_num"', lucky_text)
    return workflow

def queue_prompt(prompt, workflow=None):
    payload = {"prompt": prompt}
    if workflow:
        payload["extra_data"] = {"extra_pnginfo": {"workflow": workflow}}
        
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(f"http://{server_address}/prompt", data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code}: {e.reason}")
        print(f"Response body: {e.read().decode('utf-8')}")
        raise

def get_image(prompt_id):
    import time
    ws = websocket.WebSocket()
    ws.connect(f"ws://{server_address}/ws")
    print(f"Waiting for image data for prompt ID: {prompt_id}")
    execution_complete = False
    start_time = time.time()
    timeout = 60  # 60 second timeout
    
    while True:
        # Check for timeout
        if time.time() - start_time > timeout:
            print("Timeout waiting for image")
            ws.close()
            return None
            
        try:
            message = ws.recv()
        except Exception as e:
            print(f"Error receiving message: {e}")
            break
            
        if isinstance(message, str):
            data = json.loads(message)
            if data['type'] == 'executing':
                print(f"Received message: {data}")
                if data['data']['node'] is None and data['data']['prompt_id'] == prompt_id:
                    print("Execution completed, waiting for image data...")
                    execution_complete = True
                    # Continue listening for image
        elif isinstance(message, bytes):
            print(f"Received binary data: {len(message)} bytes")
            try:
                image = Image.open(io.BytesIO(message[8:])) # skip first 8 bytes (message type)
                print(f"Successfully parsed image: {image.size}, {image.mode}")
                ws.close()
                return image
            except Exception as e:
                print(f"Error parsing image: {e}")
                # Try without skipping bytes
                try:
                    image = Image.open(io.BytesIO(message))
                    print(f"Successfully parsed image (no skip): {image.size}, {image.mode}")
                    ws.close()
                    return image
                except Exception as e2:
                    print(f"Error parsing image (no skip): {e2}")
        
    ws.close()
    return None

def process_image(input_image_path, theme="cny", gender="female", pose="", clothes_style="", background="", enable_lucky_number=True):
    """
    Process an image through the ComfyUI workflow.
    
    Args:
        input_image_path: Path to the input image file
        theme: Theme selection ('cny' or 'hariraya')
        gender: Gender selection ('male' or 'female')
        pose: Pose description
        clothes_style: Clothes style description
        background: Background description
        enable_lucky_number: Whether to include lucky number in output (default: True)
        
    Returns:
        tuple: (success: bool, output_filename: str or None, error_message: str or None)
    """
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        if theme == "hariraya":
            workflow_file = os.path.join(base_dir, "static", "themes", "hariraya", "ZIT_FaceSwapAPI(HR).json")
        elif theme == "uits":
            workflow_file = os.path.join(base_dir, "static", "themes", "uits", "ZIT_FaceSwapAPI(uits).json")
        elif theme == "ndp2026":
            workflow_file = os.path.join(base_dir, "static", "themes", "ndp2026", "ZIT_FaceSwapAPI(ndp2026).json")
        else:
            workflow_file = os.path.join(base_dir, "static", "themes", "cny", "ZIT_FaceSwapAPI(CNY).json")

        # Load workflow from JSON file
        workflow = load_workflow(workflow_file)
        
        # Randomize Seed for KSampler (Node 44)
        seed = random.randint(1, 1000000000000000)
        if "44" in workflow and "inputs" in workflow["44"]:
            workflow["44"]["inputs"]["seed"] = seed
            print(f"Randomized Seed: {seed}")
            
        print("Workflow loaded successfully.")

        # Update the workflow with the input image and all selections
        workflow = update_workflow_with_image(workflow, input_image_path, gender, pose, clothes_style, background)
        workflow = update_workflow_with_lucky_number(workflow, enable_lucky_number, input_image_path)
        
        # Calculate gender_style for logging
        gender_style = "asian, fit and charismatic" if gender.lower() == "male" else "charismatic k-pop idol"
        
        print(f"Workflow updated with:")
        print(f"  - Input image")
        print(f"  - Gender: {gender} ({gender_style})")
        print(f"  - Pose: {pose[:50]}..." if len(pose) > 50 else f"  - Pose: {pose}")
        print(f"  - Clothes: {clothes_style[:50]}..." if len(clothes_style) > 50 else f"  - Clothes: {clothes_style}")
        print(f"  - Background: {background[:50]}..." if len(background) > 50 else f"  - Background: {background}")
        print(f"  - Lucky number")

        # Generate image
        response = queue_prompt(workflow, workflow)
        prompt_id = response['prompt_id']
        print(f"Prompt queued with ID: {prompt_id}")

        # Get generated image
        image = get_image(prompt_id)
        if image:
            output_dir = "outputs"
            os.makedirs(output_dir, exist_ok=True)
            
            base_filename = "generated_image"
            extension = ".png"
            output_filename = os.path.join(output_dir, f"{base_filename}{extension}")
            
            counter = 1
            while os.path.exists(output_filename):
                output_filename = os.path.join(output_dir, f"{base_filename}_{counter}{extension}")
                counter += 1

            image.save(output_filename)
            print(f"Image saved as {output_filename}")
            print(f"Image size: {image.size}")
            print(f"Image mode: {image.mode}")
            


            return True, output_filename, None
        else:
            return False, None, "Failed to generate image."
    except Exception as e:
        print(f"Error processing image: {str(e)}")
        return False, None, str(e)


if __name__ == "__main__":
    # Example usage when run directly
    input_image_path = "constance.jpg"
    success, output_file, error = process_image(input_image_path)
    
    if success:
        print(f"Script completed successfully. Output: {output_file}")
    else:
        print(f"Script failed: {error}")