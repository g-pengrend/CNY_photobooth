import os
import json
import re
import random
import time
from PIL import Image
import shutil

from comfy_processor import queue_prompt, get_image

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATES_DIR = os.path.join(BASE_DIR, "admin", "asset_templates")
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
        "code_prefix": "C",
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
            "middle_prompt": clean_middle,
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

def sanitize_asset_prompt(prompt_text, asset_type="backdrop"):
    """
    Remove studio template prefixes and suffixes from prompt_text so that only
    the clean, descriptive subject prompt is stored for live kiosk generation.
    """
    if not prompt_text:
        return ""
    text = str(prompt_text).strip()
    
    # Backdrop prefixes/suffixes
    text = re.sub(r'^A professional studio asset of a background environment,\s*featuring\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'Wide-angle cinematic perspective,\s*daylight atmospheric lighting,\s*high-detail textures,\s*centered composition.*$', '', text, flags=re.IGNORECASE | re.DOTALL)
    
    # Clothes prefixes/suffixes
    text = re.sub(r'^A professional studio product shot of a standalone\s+\w+\s+outfit,\s*featuring\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^A professional studio product shot of an?\s+outfit,\s*featuring\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'The outfit is displayed to maintain a 3D shape.*$', '', text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r'No human hands.*$', '', text, flags=re.IGNORECASE)
    text = re.sub(r'isolated on a solid black background.*$', '', text, flags=re.IGNORECASE | re.DOTALL)

    # Pose prefixes/suffixes
    text = re.sub(r'^A high-quality 3D Chibi-style character asset with a large head and small,\s*rounded body\.\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'Soft studio lighting with clean ambient occlusion,\s*centered composition,\s*isolated on a solid white background.*$', '', text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r'isolated on a solid white background for easy transparency masking\.*$', '', text, flags=re.IGNORECASE | re.DOTALL)

    return text.strip()

def accept_and_store_asset(preview_filename, asset_type, asset_name="", target_theme="master", prompt_desc="", gender="unisex", description=""):
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

    # Sanitize prompt description to strip any studio generator prefixes/suffixes
    clean_prompt = sanitize_asset_prompt(prompt_desc, asset_type)

    # Determine title and filename
    resolved_title, file_slug = generate_asset_name_and_slug(asset_type, asset_name, clean_prompt or prompt_desc)
    final_filename = f"{file_slug}.png"

    if not clean_prompt:
        clean_prompt = resolved_title

    # Always copy to canonical master images
    master_dir = os.path.join(BASE_DIR, "static", "themes", "master")
    master_dest_dir = os.path.join(master_dir, "images", category)
    os.makedirs(master_dest_dir, exist_ok=True)
    master_dest_path = os.path.join(master_dest_dir, final_filename)

    # Avoid collision by appending timestamp if exists
    if os.path.exists(master_dest_path):
        final_filename = f"{file_slug}-{int(time.time()) % 10000}.png"
        master_dest_path = os.path.join(master_dest_dir, final_filename)

    shutil.copy2(src_path, master_dest_path)
    canonical_web_path = f"/static/themes/master/images/{category}/{final_filename}"
    print(f"✅ [AssetGen] Canonical asset stored at: {canonical_web_path}")

    # Determine target theme directory
    theme_slug = (target_theme or "master").strip().lower()
    if theme_slug != "master":
        target_dir = os.path.join(BASE_DIR, "static", "themes", theme_slug)
        target_dest_dir = os.path.join(target_dir, "images", category)
        os.makedirs(target_dest_dir, exist_ok=True)
        shutil.copy2(src_path, os.path.join(target_dest_dir, final_filename))

    # Read master data.json to assign sequential code
    master_data_path = os.path.join(master_dir, "data.json")
    master_data = {"clothes": [], "poses": [], "backgrounds": []}
    if os.path.exists(master_data_path):
        try:
            with open(master_data_path, "r", encoding="utf-8") as f:
                master_data = json.load(f)
        except Exception:
            pass

    if category not in master_data:
        master_data[category] = []

    prefix = cfg['code_prefix']
    max_num = 0
    for it in master_data.get(category, []):
        c = str(it.get('code', ''))
        if c.startswith(prefix):
            try:
                num = int(c[len(prefix):])
                if num > max_num:
                    max_num = num
            except ValueError:
                pass
    next_num = max(len(master_data[category]), max_num) + 1
    code = f"{prefix}{next_num:02d}" if prefix == 'C' else f"{prefix}{next_num}"
    item_id = file_slug

    # Extract concise description for the FLF workflow / card subtitle
    final_desc = (description or "").strip()
    if not final_desc:
        clean_text = clean_prompt
        clean_text = re.sub(r'^(A |An |The )', '', clean_text.strip(), flags=re.IGNORECASE)
        first_clause = re.split(r'[.;\n]', clean_text.strip())[0].strip()
        words = first_clause.split()
        if len(words) > 15:
            first_clause = " ".join(words[:15])
        final_desc = first_clause if first_clause else resolved_title

    mapping_desc = final_desc
    lighting_desc = "Warm Golden and Scarlet" if "cny" in theme_slug else "Cinematic ambient studio lighting"

    # 1. Full Master Asset Definition
    master_item = {
        "id": item_id,
        "code": code,
        "title": resolved_title,
        "name": resolved_title,
        "description": final_desc,
        "image": canonical_web_path,
        "prompt": clean_prompt,
        "prompt_modifier": clean_prompt,
        "mapping_desc": mapping_desc,
        "lighting": lighting_desc
    }
    if asset_type == "clothes":
        master_item["category"] = gender or "unisex"
        master_item["gender"] = gender or "unisex"

    # Add to master if not already present
    if not any(i.get('id') == item_id for i in master_data[category]):
        master_data[category].append(master_item)
        with open(master_data_path, "w", encoding="utf-8") as f:
            json.dump(master_data, f, indent=2, ensure_ascii=False)

    # 2. If target theme is not master, add clean pointer reference to target theme data.json
    if theme_slug != "master":
        target_data_path = os.path.join(BASE_DIR, "static", "themes", theme_slug, "data.json")
        target_data = {"clothes": [], "poses": [], "backgrounds": []}
        if os.path.exists(target_data_path):
            try:
                with open(target_data_path, "r", encoding="utf-8") as f:
                    target_data = json.load(f)
            except Exception:
                pass
        if category not in target_data:
            target_data[category] = []
        theme_item_count = len(target_data[category])
        theme_code = f"{cfg['code_prefix']}{theme_item_count + 1:02d}" if cfg['code_prefix'] == 'C' else f"{cfg['code_prefix']}{theme_item_count + 1}"
        pointer = {
            "id": item_id,
            "code": theme_code,
            "title": resolved_title,
            "name": resolved_title,
            "description": final_desc,
            "image": canonical_web_path,
            "prompt": clean_prompt,
            "prompt_modifier": clean_prompt,
            "lighting": lighting_desc
        }
        if asset_type == "clothes" and gender:
            pointer["category"] = gender
        target_data[category].append(pointer)
        with open(target_data_path, "w", encoding="utf-8") as f:
            json.dump(target_data, f, indent=2, ensure_ascii=False)

    # 3. Update clothes_mapping.json for FLF workflow across themes and DGX
    if asset_type == "clothes":
        mapping_dirs = [
            os.path.join(BASE_DIR, "static", "themes", "master"),
            os.path.join(BASE_DIR, "..", "dgx_photobooth", "templates", "themes", "master")
        ]
        if theme_slug != "master":
            mapping_dirs.append(os.path.join(BASE_DIR, "static", "themes", theme_slug))
            mapping_dirs.append(os.path.join(BASE_DIR, "..", "dgx_photobooth", "templates", "themes", theme_slug))

        for m_dir in mapping_dirs:
            os.makedirs(m_dir, exist_ok=True)
            m_path = os.path.join(m_dir, "clothes_mapping.json")
            m_data = {}
            if os.path.exists(m_path):
                try:
                    with open(m_path, "r", encoding="utf-8") as mf:
                        m_data = json.load(mf)
                except Exception:
                    pass
            m_data[code] = {
                "desc": mapping_desc,
                "lighting": lighting_desc
            }
            try:
                with open(m_path, "w", encoding="utf-8") as mf:
                    json.dump(m_data, mf, indent=2, ensure_ascii=False)
                print(f"✅ [AssetGen] Updated FLF clothes mapping at: {m_path}")
            except Exception as me:
                print(f"⚠️ [AssetGen] Failed writing mapping {m_path}: {me}")

    return {
        "success": True,
        "web_path": canonical_web_path,
        "filename": final_filename,
        "title": resolved_title,
        "item": master_item,
        "target_theme": theme_slug
    }



