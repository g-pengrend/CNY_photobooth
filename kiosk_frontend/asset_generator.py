import os
import json
import re
import random
import time
from PIL import Image
import shutil

from comfy_processor import queue_prompt, get_image

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATES_DIR = os.path.join(BASE_DIR, "asset_templates")
TMP_DIR = os.path.join(BASE_DIR, "static", "tmp")
os.makedirs(TMP_DIR, exist_ok=True)

ASSET_TEMPLATES = {
    "backdrop": {
        "title": "Backdrop / Background",
        "file": "backdrop_templateAPI.json",
        "category": "backgrounds",
        "code_prefix": "B",
        "static_prefix": "A professional studio asset of a background environment, featuring \n\n",
        "default_middle": "A cinematic, mid-distance view at night focusing on the iconic Merlion statue, brilliantly illuminated as a stream of water spouts into the dark bay. In the background, the glowing Marina Bay city skyline creates a grand, luminous backdrop, with vibrant night lights and architecture reflecting shimmering colors across the water's surface.",
        "static_suffix": "\n\nWide-angle cinematic perspective, daylight atmospheric lighting, high-detail textures, centered composition",
        "prompt_node": "45",
        "sampler_node": "44"
    },
    "clothes": {
        "title": "Outfit / Clothes",
        "file": "clothes_templateAPI.json",
        "category": "clothes",
        "code_prefix": "O",
        "static_prefix_template": "A professional studio product shot of a standalone {gender} outfit, featuring \n\n",
        "default_middle": "a stylish sleeveless A-line dress that integrates a clean white bodice with a deep Singapore red skirt. The slightly flared skirt is adorned with an elegant, flowing white Vanda Miss Joaquim orchid motif pattern across its surface, balanced against the white bodice for an aesthetically pleasing mix of both colors.",
        "static_suffix": "\n\nThe outfit is displayed to maintain a 3D shape, centered composition, high-quality fabric textures, cinematic lighting, isolated on a solid black background for easy transparency masking.\n\nNo human hands",
        "prompt_node": "45",
        "sampler_node": "44"
    },
    "pose": {
        "title": "Pose",
        "file": "pose_templateAPI.json",
        "category": "poses",
        "code_prefix": "P",
        "static_prefix": "A high-quality 3D Chibi-style character asset with a large head and small, rounded body.\n\n",
        "default_middle": "Facing the camera with one hand resting firmly on the waist, the other hand resting naturally at the side. Chin slightly up, projecting confidence.",
        "static_suffix": "\n\nSoft studio lighting with clean ambient occlusion, centered composition, isolated on a solid white background for easy transparency masking.",
        "prompt_node": "45",
        "sampler_node": "44"
    }
}

def get_template_configs():
    """Return dictionary of asset template configs for UI display."""
    configs = {}
    for k, v in ASSET_TEMPLATES.items():
        prefix = v.get("static_prefix") or v.get("static_prefix_template", "").format(gender="standalone")
        configs[k] = {
            "key": k,
            "title": v["title"],
            "category": v["category"],
            "static_prefix": prefix,
            "default_middle": v["default_middle"],
            "static_suffix": v["static_suffix"]
        }
    return configs

def generate_asset_image(asset_type, middle_prompt, gender="unisex", seed=None):
    """
    Generate an asset preview using the ComfyUI API template workflow.
    
    Returns:
        dict: { 'success': bool, 'preview_url': str, 'seed': int, 'full_prompt': str, 'error': str }
    """
    if asset_type not in ASSET_TEMPLATES:
        return {"success": False, "error": f"Unknown asset type: {asset_type}"}

    cfg = ASSET_TEMPLATES[asset_type]
    template_path = os.path.join(TEMPLATES_DIR, cfg["file"])
    if not os.path.exists(template_path):
        return {"success": False, "error": f"Template file not found: {cfg['file']}"}

    with open(template_path, "r", encoding="utf-8") as f:
        workflow = json.load(f)

    # Format full prompt
    if asset_type == "clothes":
        gender_word = gender.lower()
        if gender_word not in ["male", "female"]:
            gender_word = "standalone"
        prefix = cfg["static_prefix_template"].format(gender=gender_word)
    else:
        prefix = cfg["static_prefix"]

    suffix = cfg["static_suffix"]
    clean_middle = middle_prompt.strip()
    full_prompt = f"{prefix}{clean_middle}{suffix}"

    # Inject into prompt node
    prompt_node_id = cfg["prompt_node"]
    if prompt_node_id in workflow and "inputs" in workflow[prompt_node_id]:
        workflow[prompt_node_id]["inputs"]["text"] = full_prompt

    # Inject seed into sampler node
    sampler_node_id = cfg["sampler_node"]
    gen_seed = seed if seed is not None else random.randint(1, 10**15)
    if sampler_node_id in workflow and "inputs" in workflow[sampler_node_id]:
        workflow[sampler_node_id]["inputs"]["seed"] = gen_seed

    print(f"🎨 [AssetGen] Queuing {asset_type} generation with seed: {gen_seed}")

    try:
        response = queue_prompt(workflow)
        prompt_id = response.get("prompt_id")
        if not prompt_id:
            return {"success": False, "error": "ComfyUI did not return a prompt_id"}

        # Listen on websocket for image
        img = get_image(prompt_id)
        if not img:
            return {"success": False, "error": "Failed to receive generated image from ComfyUI (timeout or disconnected)"}

        # Save temporary preview
        preview_filename = f"preview_{asset_type}_{int(time.time())}.png"
        preview_filepath = os.path.join(TMP_DIR, preview_filename)
        img.save(preview_filepath, format="PNG")

        preview_url = f"/static/tmp/{preview_filename}"
        print(f"✅ [AssetGen] Preview saved to {preview_url}")
        return {
            "success": True,
            "preview_url": preview_url,
            "preview_filename": preview_filename,
            "seed": gen_seed,
            "full_prompt": full_prompt
        }

    except Exception as e:
        print(f"❌ [AssetGen] Error: {e}")
        return {"success": False, "error": str(e)}

def slugify_name(name):
    """Convert human title to safe file name."""
    s = name.strip().lower()
    s = re.sub(r'[^a-z0-9]+', '-', s)
    s = s.strip('-')
    return s or f"asset-{int(time.time())}"

def generate_asset_name_and_slug(asset_type, asset_name="", prompt_desc=""):
    """
    Autogenerate a clean title and filename slug if not provided, or slugify user title.
    """
    if asset_name and asset_name.strip():
        title = asset_name.strip()
        slug = slugify_name(title)
        return title, slug

    # If no title given, extract meaningful keywords from prompt_desc
    clean = re.sub(r'[^a-zA-Z0-9\s]', ' ', (prompt_desc or '').lower())
    stop_words = {
        'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
        'is', 'are', 'was', 'were', 'it', 'and', 'or', 'as', 'that', 'this', 'into',
        'featuring', 'professional', 'studio', 'asset', 'centered', 'composition',
        'lighting', 'high', 'detail', 'perspective', 'view', 'wide', 'angle',
        'cinematic', 'isolated', 'solid', 'background', 'transparency', 'masking',
        'ambient', 'occlusion', 'clean', 'soft', 'character', 'chibi', 'style'
    }
    keywords = [w for w in clean.split() if len(w) > 2 and w not in stop_words]
    if keywords:
        selected_keywords = keywords[:4]
        slug = "-".join(selected_keywords)
        title = " ".join(selected_keywords).title()
    else:
        suffix_id = str(int(time.time()))[-5:]
        slug = f"{asset_type}-{suffix_id}"
        title = f"{asset_type.title()} {suffix_id}"
    return title, slug

def accept_and_store_asset(preview_filename, asset_type, asset_name="", target_theme="master", prompt_desc="", gender="unisex"):
    """
    Accept a generated preview image, autogenerate clean filename, and store into the target theme or master library.
    """
    if asset_type not in ASSET_TEMPLATES:
        return {"success": False, "error": f"Invalid asset type: {asset_type}"}

    cfg = ASSET_TEMPLATES[asset_type]
    category = cfg["category"]
    src_path = os.path.join(TMP_DIR, preview_filename)
    if not os.path.exists(src_path):
        return {"success": False, "error": "Preview image file no longer exists"}

    # Determine title and filename
    resolved_title, file_slug = generate_asset_name_and_slug(asset_type, asset_name, prompt_desc)
    final_filename = f"{file_slug}.png"

    # Target directory in theme or master
    theme_slug = (target_theme or "master").strip().lower()
    theme_dir = os.path.join(BASE_DIR, "static", "themes", theme_slug)
    dest_dir = os.path.join(theme_dir, "images", category)
    os.makedirs(dest_dir, exist_ok=True)
    dest_path = os.path.join(dest_dir, final_filename)

    # Avoid collision by appending timestamp if exists
    if os.path.exists(dest_path):
        final_filename = f"{file_slug}-{int(time.time()) % 10000}.png"
        dest_path = os.path.join(dest_dir, final_filename)

    shutil.copy2(src_path, dest_path)
    web_path = f"/static/themes/{theme_slug}/images/{category}/{final_filename}"
    print(f"✅ [AssetGen] Asset permanently stored at: {web_path}")

    # Register into target theme data.json
    data_json_path = os.path.join(theme_dir, "data.json")
    theme_data = {"clothes": [], "poses": [], "backgrounds": []}
    if os.path.exists(data_json_path):
        try:
            with open(data_json_path, "r", encoding="utf-8") as f:
                theme_data = json.load(f)
        except Exception:
            pass

    if category not in theme_data:
        theme_data[category] = []

    item_count = len(theme_data[category])
    code = f"{cfg['code_prefix']}{item_count + 1}"
    item_id = f"{theme_slug}_{file_slug}"

    new_item = {
        "id": item_id,
        "code": code,
        "title": resolved_title,
        "name": resolved_title,
        "image": web_path,
        "prompt_modifier": prompt_desc or resolved_title,
        "lighting": "Cinematic ambient studio lighting"
    }

    if asset_type == "clothes":
        new_item["category"] = gender or "unisex"
        new_item["gender"] = gender or "unisex"

    theme_data[category].append(new_item)

    with open(data_json_path, "w", encoding="utf-8") as f:
        json.dump(theme_data, f, indent=2, ensure_ascii=False)

    return {
        "success": True,
        "web_path": web_path,
        "filename": final_filename,
        "title": resolved_title,
        "item": new_item,
        "target_theme": theme_slug
    }

