import json
import os
import random
import re
import urllib.request
import base64
import io
from PIL import Image
import websocket
from face_analysis import generate_lucky_number_from_face
from workflow_inspector import load_theme_bindings

DEFAULT_PORTRAIT_FRAMING = "Extreme Close up shot of"
DEFAULT_PORTRAIT_CLOSER = (
    "Upper body shot, large clear face positioned cleanly below the top title banner, shallow depth of field."
)


def _cleanup_prompt_punctuation(text: str, capitalize_start: bool = False) -> str:
    text = re.sub(r'\s+([,.;])', r'\1', text)
    text = re.sub(r',\s*,+', ',', text)
    text = re.sub(r'\(\s*\)', '', text)
    text = re.sub(r',\s*\.', '.', text)
    text = re.sub(r'\.\s*\.', '.', text)
    text = re.sub(r'\b(?:and|with)\s*\.', '.', text, flags=re.IGNORECASE)
    text = re.sub(r'^\s*[,.;]\s*', '', text)
    text = re.sub(r'\s{2,}', ' ', text).strip()
    if text:
        text = re.sub(r'(?<=\.\s)([a-z])', lambda m: m.group(1).upper(), text)
        if capitalize_start:
            text = text[0].upper() + text[1:]
    return text


def sanitize_background_for_portrait(background: str) -> str:
    """Strip wide-shot camera-distance and empty-stage directives that pull Z-Image Turbo into full-body framing."""
    if not background:
        return ""
    orig = str(background).strip()
    text = orig
    stripped_start = False

    # If multi-line pasted asset prompt contains "Prompt:", keep only the prompt body
    m_prompt = re.search(r'(?:^|\n)\s*Prompt\s*:\s*([\s\S]+)$', text, flags=re.IGNORECASE)
    if m_prompt:
        text = m_prompt.group(1).strip()
        stripped_start = True

    text_no_prefix = re.sub(r'^(?:prompt|variable description)\s*:\s*', '', text, flags=re.IGNORECASE)
    if text_no_prefix != text:
        text = text_no_prefix
        stripped_start = True

    # Strip leading camera-distance openers ("A cinematic, mid-distance view at night of ...")
    text_no_cam = re.sub(
        r'^(?:A|An)\s+(?:cinematic,?\s+)?(?:clean,?\s+|epic,?\s+|straight-on,?\s+|symmetrical,?\s+|ultra-realistic\s+)?'
        r'(?:wide-angle,?\s+|wide\s+|mid-distance\s+|medium-distance\s+|eye-level\s+|low-angle\s+|panoramic\s+|street-level\s+)+'
        r'(?:cinematic\s+)?(?:view|shot|perspective|street\s+shot|street\s+landscape|architectural\s+shot)\s+'
        r'(?:at\s+(?:night|dusk|twilight|dawn)\s+)?'
        r'(?:of|across|from|along|down(?:\s+the\s+dead-center\s+median\s+of)?|looking\s+(?:down|up\s+at)|focusing\s+on|framing)\s+',
        '',
        text,
        flags=re.IGNORECASE,
    )
    if text_no_cam != text:
        text = text_no_cam
        stripped_start = True

    # Strip marketing imperatives at start ("Step into ...", "Capture your ... in ...")
    text_no_imp = re.sub(r'^(?:Step\s+into|Capture\s+your\s+[\w\s]+?in)\s+', '', text, flags=re.IGNORECASE)
    if text_no_imp != text:
        text = text_no_imp
        stripped_start = True

    # Strip/soften open-stage & foreground-platform directives
    text = re.sub(
        r'The\s+foreground\s+and\s+center\s+feature\s+an?\s+[^.;]*?(?:platform|stage|floor)[^.;]*?'
        r'(?:photobooth\s+subject|portrait|subjects?)\s*,?\s*(?:elegantly\s+)?',
        '',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r'The\s+central\s+(?:stage|platform)\s+remains\s+[^.;]*?(?:subjects?|portrait)\s*,?\s*',
        '',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r'The\s+open,?\s+softly\s+lit\s+central\s+(?:stage|platform)\s+is\s+', '', text, flags=re.IGNORECASE)
    text = re.sub(r'designed\s+as\s+(?:a\s+clear|the\s+perfect)\s+photobooth\s+stage\.?', '', text, flags=re.IGNORECASE)
    text = re.sub(r'with\s+a\s+beautifully\s+lit,?\s+open\s+central\s+platform\.?', '', text, flags=re.IGNORECASE)
    text = re.sub(r'where\s+a\s+pristine,?\s+snow-dusted\s+stage\s+awaits,?\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(
        r'The\s+foreground\s+features\s+a\s+spacious,?\s+[^.]*?clear\s+stage\s+for\s+a\s+portrait[^.]*\.',
        '',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r',?\s*while\s+leaving\s+the\s+wide\s+foreground\s+spacious[^.]*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\btoy\s+theatre\s+stage\b', 'toy theatre backdrop', text, flags=re.IGNORECASE)

    # Strip/soften wide-shot & deep-focus directives
    text = re.sub(
        r'Ultra-detailed,?\s*cinematic\s+wide\s+shot,?\s*sharp\s+focus\s+from\s+foreground\s+to\s+background\.?',
        '',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r'\bsharp\s+focus\s+from\s+foreground\s+to\s+background\b', 'softly blurred background depth', text, flags=re.IGNORECASE)
    text = re.sub(r'\b(?:cinematic\s+)?wide[- ]angle\s+(?:cinematic\s+)?(?:shot|view|perspective)\b', 'scenic backdrop', text, flags=re.IGNORECASE)
    text = re.sub(r'\bcinematic\s+wide\s+shot\b', 'scenic backdrop', text, flags=re.IGNORECASE)
    text = re.sub(r'\bvanishing\s+into\s+a\s+single\s+point\s+on\s+the\s+horizon\b', 'receding softly into the bokeh distance', text, flags=re.IGNORECASE)

    # Preserve untouched prompts (e.g., CNY B01-B10, Hari Raya B01-B05) 100% verbatim
    if not stripped_start and text.strip() == orig:
        return orig

    return _cleanup_prompt_punctuation(text, capitalize_start=stripped_start)


def sanitize_pose_for_portrait(pose: str) -> str:
    """Remove full-body feet/stance/ceiling cues that shrink faces or collide with top banners."""
    if not pose:
        return ""
    text = str(pose).strip()
    text = re.sub(r'^(?:prompt|variable description)\s*:\s*', '', text, flags=re.IGNORECASE)

    # Soften overhead arms that force zoom-out or collide with the top title banner
    text = re.sub(
        r'\bone arm raised straight up,\s*index finger pointing upward to make a number\s*["\']?one["\']?\s*sign\b',
        'one hand held near shoulder height with index finger raised to make a cheerful number "one" sign',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r'\bboth arms stretched straight up toward the ceiling\b',
        'both arms raised cheerfully near shoulder height',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r'\bone arm raised straight up into the air\b',
        'one arm raised cheerfully near shoulder height',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r'\bone arm raised straight up\b',
        'one arm raised cheerfully near shoulder height',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r'\bpointing high into the upper diagonal\b',
        'pointing outward cheerfully to the side',
        text,
        flags=re.IGNORECASE,
    )

    # Keep hand placement waist/hip-level instead of thighs
    text = re.sub(r'\bagainst the outer thigh\b', 'naturally at the waist', text, flags=re.IGNORECASE)
    text = re.sub(r'\bagainst the front of the thighs\b', 'near the waist', text, flags=re.IGNORECASE)

    # Strip lower-body feet, toes, and wide-stance instructions
    text = re.sub(
        r'\bFeet are set shoulder-width apart with\s+',
        'Looking forward with ',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r'\bFeet are planted firmly shoulder-width apart in a solid,\s*unmoving stance,\s*',
        'Confident upright posture, ',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r',?\s*\bstanding upright with feet shoulder-width apart\s*,?',
        ', confident posture,',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r'\bstanding in a grounded wide stance\b',
        'with confident upright posture',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r'\bStanding tall on the toes,\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(
        r'\bStanding balanced with feet (?:slightly apart|shoulder-width apart|planted firmly),\s*',
        '',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r'\bStanding tall with\s+', 'With ', text, flags=re.IGNORECASE)
    text = re.sub(r'\bStanding tall\b\s*,?\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\bStanding firmly\b\s*,?\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(
        r'\bwith feet (?:slightly apart|shoulder-width apart|planted firmly)\s*,?\s*',
        '',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r'\bon the toes\s*,?\s*', '', text, flags=re.IGNORECASE)

    return _cleanup_prompt_punctuation(text)


def sanitize_clothes_for_portrait(clothes_style: str) -> str:
    """Strip full-body gown/trouser/footwear triggers so Z-Image Turbo holds waist/knee-up framing."""
    if not clothes_style:
        return ""
    text = str(clothes_style).strip()
    text = re.sub(r'^(?:prompt|variable description)\s*:\s*', '', text, flags=re.IGNORECASE)

    text = re.sub(r'\bfloor-length\b', 'tailored', text, flags=re.IGNORECASE)
    text = re.sub(
        r'\bfull-length(?=\s+(?:[\w-]+\s+){0,3}(?:skirt|gown|dress|robe|portrait|silhouette|outfit|look|ensemble)\b)',
        'tailored',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r'\b(?:ankle-length|mid-calf|knee-length)\b', 'tailored', text, flags=re.IGNORECASE)
    text = re.sub(r'\bvoluminous,\s*(?:tailored|floor-length)\b', 'high-waisted', text, flags=re.IGNORECASE)
    text = re.sub(r'\bballerina\b', 'holiday princess', text, flags=re.IGNORECASE)
    text = re.sub(r'\b(?:straight|down) to the floor\b', 'gracefully', text, flags=re.IGNORECASE)
    text = re.sub(
        r',?\s*(?:cropped neatly just above the ankles|tailored precisely to break cleanly at the instep)\b',
        '',
        text,
        flags=re.IGNORECASE,
    )

    # Strip full-body lower-garment trouser/churidar triggers (Config B)
    text = re.sub(r'\bThe look is grounded with\s+[^.]*?\b(?:trousers|churidar)\b[^.]*\.', '', text, flags=re.IGNORECASE)
    text = re.sub(
        r'\b(is|are)\s+(?:elegantly\s+)?paired\s+with\s+[^.;]*?\b(?:trousers|churidar)\b(?:\s+and\s+(?=finished|completed|paired))?',
        r'\1 ',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r'(?:,?\s*\band\s+|,\s*|\s+)?(?:elegantly\s+)?paired\s+with\s+(?:(?!\band\s+(?:finished|completed)\b)[^.;])*?\b(?:trousers|churidar)\b(?:\s*,?\s*tailored\s+(?:cleanly\s+over|precisely)[^.;]*)?(?:\s+and\s+(?=finished|completed))?',
        '',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r'\b(?:He|She|Subject)\s+wears\s+[^.;]*?\b(?:trousers|churidar)\b(?:\s+and\s+[^,.;]*)?,?\s*',
        '',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r',?\s*\btailored cleanly over[^.]*', '', text, flags=re.IGNORECASE)

    # Strip footwear mentions
    text = re.sub(
        r'(?:\s*,?\s*\band\s+(?:paired\s+with\s+|finished\s+with\s+)?|\s*,?\s*(?:paired|finished)\s+with\s+|\s+)(?:(?!\band\b|\bwith\b)[\w-]+\s+){0,3}(?:ankle\s+boots|leather\s+boots|dress\s+shoes|boots|shoes|sandals|heels|juttis|mojaris|loafers?|sneakers?|slippers?)\b',
        '',
        text,
        flags=re.IGNORECASE,
    )

    return _cleanup_prompt_punctuation(text, capitalize_start=True)


def sanitize_gender_style(gender_style: str, gender: str = "female") -> str:
    """Keep gender_style focused on persona/charisma rather than garments that clash with clothes_style."""
    fallback = "asian, fit and charismatic" if str(gender).lower() == "male" else "charismatic, radiant and photogenic"
    if not gender_style:
        return fallback
    text = str(gender_style).strip()
    text = re.sub(
        r'\s+in\s+(?:a\s+|an\s+)?(?:[\w-]+\s+){0,3}(?:dinner\s+suit|evening\s+gown|suit|gown|dress|outfit)\b.*$',
        '',
        text,
        flags=re.IGNORECASE,
    ).strip()

    has_garment = bool(
        re.search(r'\b(?:sweater|shirt|dress|gown|suit|jacket|blazer|trousers|skirt|vest|cardigan)\b', text, re.IGNORECASE)
    )
    has_persona = bool(
        re.search(r'\b(?:man|woman|lady|idol|gentleman|person|model|asian|charismatic|executive|male|female|radiant|photogenic)\b', text, re.IGNORECASE)
    )
    if not text or (has_garment and not has_persona):
        return fallback
    return text


def normalize_framing_in_prompt(prompt_text: str) -> str:
    """Upgrade legacy 'Medium shot, waist up shot of' framing + append Upper body anchor without altering CNY/HR."""
    if not prompt_text:
        return ""
    text = str(prompt_text)
    if re.search(r'\bMedium shot,\s*waist up shot of\b', text, flags=re.IGNORECASE):
        text = re.sub(
            r'\bMedium shot,\s*waist up shot of\b',
            DEFAULT_PORTRAIT_FRAMING,
            text,
            flags=re.IGNORECASE,
        )
        if "upper body shot" not in text.lower():
            text = f"{text.rstrip()} {DEFAULT_PORTRAIT_CLOSER}"
    return text

# Configuration
from config import COMFY_SERVER_ADDRESS
server_address = COMFY_SERVER_ADDRESS

def load_workflow(filename):
    with open(filename, 'r', encoding='utf-8') as file:
        return json.load(file)

def encode_image_to_base64(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def get_theme_gender_style(theme_dir, gender="female"):
    """Resolve male and female persona style from theme.json or fallback defaults."""
    male_style = "executive leading man"
    female_style = "charismatic k-pop idol"
    if theme_dir and os.path.exists(theme_dir):
        theme_json_file = os.path.join(theme_dir, "theme.json")
        if os.path.exists(theme_json_file):
            try:
                with open(theme_json_file, 'r', encoding='utf-8') as tjf:
                    t_data = json.load(tjf)
                    pt = t_data.get('promptTemplate', {})
                    if pt.get('maleStyle'):
                        male_style = pt['maleStyle']
                    if pt.get('femaleStyle'):
                        female_style = pt['femaleStyle']
            except Exception:
                pass
    return male_style if str(gender).lower() == "male" else female_style

def update_workflow_with_image(workflow, image_path, gender="female", pose="", clothes_style="", background="", bindings=None, theme_dir=None):
    """Update workflow with uploaded image and all user selections dynamically"""
    bindings = bindings or {}
    image_node = bindings.get("input_image_node", "65")
    prompt_node = bindings.get("prompt_node", "45")
    face_swap_node = bindings.get("face_swap_node", "57")

    base64_image = encode_image_to_base64(image_path)
    if image_node in workflow and "inputs" in workflow[image_node]:
        workflow[image_node]["inputs"]["base64_data"] = base64_image
    
    # Logic for gender_style from theme configuration if available
    gender_style = get_theme_gender_style(theme_dir, gender)

    # Runtime defensive sanitization: strip any legacy studio boilerplate if present in theme data
    try:
        from asset_generator import sanitize_asset_prompt
        pose = sanitize_asset_prompt(pose, "pose")
        clothes_style = sanitize_asset_prompt(clothes_style, "clothes")
        background = sanitize_asset_prompt(background, "backdrop")
    except Exception:
        pass

    # Enforce portrait-friendly framing & strip full-body zoom triggers
    gender_style = sanitize_gender_style(gender_style, gender)
    pose = sanitize_pose_for_portrait(pose)
    clothes_style = sanitize_clothes_for_portrait(clothes_style)
    background = sanitize_background_for_portrait(background)

    # Update prompt text with all variable syntax forms:
    # Supports ComfyUI JSON escaped syntax: \"pose\", literal \"pose\", \"gender\", and {pose}
    if prompt_node in workflow and "inputs" in workflow[prompt_node] and "text" in workflow[prompt_node]["inputs"]:
        current_text = normalize_framing_in_prompt(workflow[prompt_node]["inputs"]["text"])
        token_map = [
            ("gender", gender),
            ("gender_style", gender_style),
            ("pose", pose),
            ("clothes_style", clothes_style),
            ("background", background)
        ]
        for key, val in token_map:
            variants = [
                f'\\"{key}\\"',        # Literal backslash + quote: \"key\"
                f'"{key}"',            # Standard double quotes: "key"
                f'\\\"{{{key}}}\\\"',  # Escaped quote with braces: \"{key}\"
                f'\"{{{key}}}\"',      # Double quote with braces: "{key}"
                f'{{{key}}}'           # Plain curly braces: {key}
            ]
            for var in variants:
                current_text = current_text.replace(var, str(val))
        workflow[prompt_node]["inputs"]["text"] = current_text
    
    # Update gender detection fields if node exists
    if face_swap_node in workflow and "inputs" in workflow[face_swap_node]:
        workflow[face_swap_node]["inputs"]["detect_gender_input"] = "no"
        workflow[face_swap_node]["inputs"]["detect_gender_source"] = "no"
    
    return workflow

def update_workflow_with_lucky_number(workflow, enable_lucky_number=True, image_path=None, bindings=None):

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
    
    prompt_node = (bindings or {}).get("prompt_node", "45")
    if prompt_node in workflow and "inputs" in workflow[prompt_node] and "text" in workflow[prompt_node]["inputs"]:
        current_text = workflow[prompt_node]["inputs"]["text"]
        for tok in ['\\"lucky_num\\"', '"lucky_num"', '"{lucky_num}"', '{lucky_num}', '\\"{lucky_num}\\"']:
            current_text = current_text.replace(tok, lucky_text)
        workflow[prompt_node]["inputs"]["text"] = current_text
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
    except urllib.error.URLError as e:
        msg = f"Cannot reach ComfyUI backend at http://{server_address} ({e.reason}). Make sure the backend server is running and Tailscale is CONNECTED on this PC (or enter the host's direct IP in .receiver_address)."
        print(f"[ERROR] {msg}")
        raise RuntimeError(msg) from e

def get_image(prompt_id):
    import time
    ws = websocket.WebSocket()
    ws.connect(f"ws://{server_address}/ws")
    print(f"Waiting for image data for prompt ID: {prompt_id}")
    execution_complete = False
    start_time = time.time()
    timeout = 240  # 240 second (4 minute) timeout to allow for first-run model loading
    
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
        theme_dir = os.path.join(base_dir, "static", "themes", theme)
        workflow_file = None

        # Dynamically find workflow in theme directory
        if os.path.exists(theme_dir):
            for fname in os.listdir(theme_dir):
                if fname.endswith(".json") and ("ZIT" in fname or "workflow" in fname.lower()) and fname != "bindings.json":
                    workflow_file = os.path.join(theme_dir, fname)
                    break

        if not workflow_file:
            # Fallback
            workflow_file = os.path.join(base_dir, "static", "themes", "cny", "ZIT_FaceSwapAPI(CNY).json")

        # Load dynamic theme bindings
        bindings = load_theme_bindings(theme_dir) if os.path.exists(theme_dir) else {}
        sampler_node = bindings.get("sampler_node", "44")

        # Load workflow from JSON file
        workflow = load_workflow(workflow_file)
        
        # Randomize Seed for KSampler dynamically
        seed = random.randint(1, 1000000000000000)
        if sampler_node in workflow and "inputs" in workflow[sampler_node]:
            workflow[sampler_node]["inputs"]["seed"] = seed
            print(f"Randomized Seed in Node #{sampler_node}: {seed}")
            
        print(f"Workflow loaded successfully for theme: {theme} ({os.path.basename(workflow_file)})")

        gender_style = get_theme_gender_style(theme_dir, gender)

        # Update the workflow with the input image and all selections using dynamic bindings
        workflow = update_workflow_with_image(workflow, input_image_path, gender, pose, clothes_style, background, bindings=bindings, theme_dir=theme_dir)
        workflow = update_workflow_with_lucky_number(workflow, enable_lucky_number, input_image_path, bindings=bindings)


        
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