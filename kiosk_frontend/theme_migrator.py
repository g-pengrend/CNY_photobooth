"""
Theme Migrator & Serializer
Utility to migrate existing legacy themes into the modern data schema:
- theme.json (styling, atmosphere, waiting sequence, features, branding)
- data.json (unified clothes + poses + backgrounds with DGX mapping)
- bindings.json (auto-detected ComfyUI node bindings)
"""

import os
import re
import json
from workflow_inspector import inspect_kiosk_workflow, inspect_video_workflow

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
THEMES_DIR = os.path.join(BASE_DIR, "static", "themes")
DGX_THEMES_DIR = os.path.join(BASE_DIR, "..", "dgx_photobooth", "templates", "themes")

# Metadata defaults per theme
THEME_METADATA = {
    "cny": {
        "title": "CNY Photo Booth",
        "subtitle": "SEIT 4D Vision Studio",
        "badge": "Lunar Prosperity",
        "icon": "🏮",
        "description": "Capture the Glow, Steal the Show, and get your CNY Numbers to go! Experience the SEIT magic in Red, Gold, and AI.",
        "cta": "开始 Start",
        "status": "live",
        "features": { "luckyNumber": True, "filmStrip": False, "genderFilter": True },
        "background": {
            "type": "particles",
            "floatingIcons": ["🧧", "🏮", "💰", "🍊", "🍍"],
            "filmStrip": False
        },
        "style": {
            "fontFamily": "'Inter', 'Noto Sans SC', sans-serif",
            "googleFontUrl": "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700;900&family=Inter:wght@400;600;700&display=swap",
            "colors": {
                "background": "#0F0306",
                "text": "#FFFFFF",
                "primary": "#8B0000",
                "accent": "#D4AF37",
                "accentGlow": "rgba(212, 175, 55, 0.25)",
                "surface": "rgba(255, 255, 255, 0.05)",
                "surfaceBorder": "rgba(212, 175, 55, 0.3)"
            },
            "gradients": {
                "radialBackground": "radial-gradient(circle at 50% 50%, rgba(212, 175, 55, 0.15) 0%, transparent 70%)",
                "primaryButton": "linear-gradient(135deg, #B8860B 0%, #D4AF37 50%, #FFDF00 100%)"
            }
        },
        "waitingExperience": {
            "title": "Creating Magic...",
            "subtitle": "Processing your photo",
            "sequence": [
                { "text": "Analyzing facial geometry...", "color": "#FFD700", "size": "1.3rem", "delay": 500 },
                { "text": "Calculating your prosperity metrics...", "color": "#FFF8DC", "size": "1.1rem", "delay": 2500 },
                { "text": "Synthesizing festive silk textures...", "opacity": 0.8, "delay": 5000 },
                { "text": "Aligning your auspicious lucky numbers...", "opacity": 0.8, "delay": 8500 },
                { "text": "Infusing celebratory golden aura...", "opacity": 0.8, "delay": 11500 },
                { "text": "Ready to welcome prosperity!", "opacity": 0.8, "delay": 14000 }
            ],
            "completionMessage": "Calculations Complete! Ready to manifest."
        }
    },
    "uits": {
        "title": "UITS 50th Anniversary",
        "subtitle": "Golden Jubilee Dinner",
        "badge": "Golden Jubilee",
        "icon": "✨",
        "description": "Celebrate 50 years of excellence and prestige with our exclusive Golden Jubilee Gala experience.",
        "cta": "Start Experience",
        "status": "live",
        "features": { "luckyNumber": False, "filmStrip": True, "genderFilter": True },
        "background": {
            "type": "particles",
            "floatingIcons": ["✨", "✦", "⭐", "✧"],
            "filmStrip": True
        },
        "style": {
            "fontFamily": "'Outfit', 'Inter', sans-serif",
            "googleFontUrl": "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Inter:wght@400;600;700&display=swap",
            "colors": {
                "background": "#050505",
                "text": "#FFF8DC",
                "primary": "#1a1a1a",
                "accent": "#D4AF37",
                "accentGlow": "rgba(212, 175, 55, 0.25)",
                "surface": "rgba(255, 255, 255, 0.05)",
                "surfaceBorder": "rgba(212, 175, 55, 0.3)"
            },
            "gradients": {
                "radialBackground": "radial-gradient(circle at 50% 50%, rgba(212, 175, 55, 0.15) 0%, transparent 70%)",
                "primaryButton": "linear-gradient(135deg, #B8860B 0%, #D4AF37 50%, #FFDF00 100%)"
            }
        },
        "waitingExperience": {
            "title": "Creating Magic...",
            "subtitle": "Processing your photo",
            "sequence": [
                { "text": "Happy 50th Anniversary!", "color": "#FFD700", "size": "1.4rem", "delay": 500 },
                { "text": "UITS Golden Jubilee", "color": "#FFF8DC", "size": "1.1rem", "delay": 2500 },
                { "text": "Unveiling the luxurious textures...", "opacity": 0.8, "delay": 5000 },
                { "text": "Enhancing the golden bokeh...", "opacity": 0.8, "delay": 8000 },
                { "text": "Perfecting the chiaroscuro lighting...", "opacity": 0.8, "delay": 11000 },
                { "text": "Getting ready for the Jubilee Dinner!", "opacity": 0.8, "delay": 13500 }
            ],
            "completionMessage": "Calculations Complete! Ready to manifest."
        }
    },
    "ndp2026": {
        "title": "NDP 2026",
        "subtitle": "Majulah Singapura — Go Beyond!",
        "badge": "National Day",
        "icon": "🎆",
        "description": "Celebrate the nation's milestone in iconic red, crisp white, and futuristic brilliance.",
        "cta": "Join the Celebration",
        "status": "live",
        "features": { "luckyNumber": False, "filmStrip": True, "genderFilter": True },
        "background": {
            "type": "particles",
            "floatingIcons": ["⭐", "✨", "🎆", "✦"],
            "filmStrip": True
        },
        "style": {
            "fontFamily": "'Outfit', 'Inter', sans-serif",
            "googleFontUrl": "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&family=Inter:wght@400;600;700&display=swap",
            "colors": {
                "background": "#0F0306",
                "text": "#FFFFFF",
                "primary": "#ED1C24",
                "accent": "#FFC72C",
                "accentGlow": "rgba(237, 28, 36, 0.25)",
                "surface": "rgba(255, 255, 255, 0.05)",
                "surfaceBorder": "rgba(237, 28, 36, 0.3)"
            },
            "gradients": {
                "radialBackground": "radial-gradient(circle at 50% 50%, rgba(237, 28, 36, 0.25) 0%, transparent 70%)",
                "primaryButton": "linear-gradient(135deg, #ED1C24 0%, #C4121A 50%, #800000 100%)"
            }
        },
        "waitingExperience": {
            "title": "Creating Magic...",
            "subtitle": "Processing your photo",
            "sequence": [
                { "text": "Happy NDP 2026!", "color": "#FFD700", "size": "1.4rem", "delay": 500 },
                { "text": "Majulah Singapura — Go Beyond!", "color": "#FFFFFF", "size": "1.1rem", "delay": 2500 },
                { "text": "Unveiling the vibrant festive textures...", "opacity": 0.8, "delay": 5000 },
                { "text": "Enhancing the celebratory fireworks glow...", "opacity": 0.8, "delay": 8000 },
                { "text": "Perfecting the National Day portrait lighting...", "opacity": 0.8, "delay": 11000 },
                { "text": "Getting ready for the NDP 2026 Celebration!", "opacity": 0.8, "delay": 13500 }
            ],
            "completionMessage": "Calculations Complete! Ready to manifest."
        }
    },
    "hariraya": {
        "title": "Hari Raya Aidilfitri",
        "subtitle": "Salam Lebaran Celebration",
        "badge": "Aidilfitri",
        "icon": "🌙",
        "description": "Embrace the spirit of Syawal with exquisite songket, vibrant festive colors, and traditional elegance.",
        "cta": "Start Celebration",
        "status": "live",
        "features": { "luckyNumber": False, "filmStrip": False, "genderFilter": True },
        "background": {
            "type": "particles",
            "floatingIcons": ["🌙", "⭐", "✨", "🕌"],
            "filmStrip": False
        },
        "style": {
            "fontFamily": "'Outfit', 'Inter', sans-serif",
            "googleFontUrl": "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&family=Inter:wght@400;600;700&display=swap",
            "colors": {
                "background": "#021A10",
                "text": "#F5F5DC",
                "primary": "#0B4627",
                "accent": "#EEDD82",
                "accentGlow": "rgba(238, 221, 130, 0.25)",
                "surface": "rgba(255, 255, 255, 0.05)",
                "surfaceBorder": "rgba(238, 221, 130, 0.3)"
            },
            "gradients": {
                "radialBackground": "radial-gradient(circle at 50% 50%, rgba(11, 70, 39, 0.35) 0%, transparent 70%)",
                "primaryButton": "linear-gradient(135deg, #0B4627 0%, #177245 50%, #EEDD82 100%)"
            }
        },
        "waitingExperience": {
            "title": "Creating Magic...",
            "subtitle": "Processing your photo",
            "sequence": [
                { "text": "Selamat Hari Raya!", "color": "#eedd82", "size": "1.4rem", "delay": 500 },
                { "text": "Maaf Zahir dan Batin", "color": "#FFFFFF", "size": "1.1rem", "delay": 2500 },
                { "text": "Weaving your festive songket...", "opacity": 0.8, "delay": 5000 },
                { "text": "Preparing traditional Kuih Raya...", "opacity": 0.8, "delay": 8000 },
                { "text": "Lighting the oil lamps...", "opacity": 0.8, "delay": 11000 },
                { "text": "Getting ready to celebrate!", "opacity": 0.8, "delay": 13500 }
            ],
            "completionMessage": "Calculations Complete! Ready to manifest."
        }
    }
}


def parse_js_array(js_content: str, var_name: str):
    """Simple parser to extract exported JS array objects from data.js"""
    pattern = rf"export\s+const\s+{var_name}\s*=\s*(\[.*?\]);"
    match = re.search(pattern, js_content, re.DOTALL)
    if not match:
        return []
    
    raw_array = match.group(1)
    # Convert relaxed JS object syntax to valid JSON
    # 1. Remove comments
    cleaned = re.sub(r'//.*', '', raw_array)
    # 2. Quote unquoted keys (e.g. category: -> "category":)
    cleaned = re.sub(r'([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:', r'\1"\2":', cleaned)
    # 3. Remove trailing commas before } or ]
    cleaned = re.sub(r',\s*([}\]])', r'\1', cleaned)

    try:
        return json.loads(cleaned)
    except Exception as e:
        print(f"⚠️ JSON parse error for {var_name}: {e}")
        # Fallback eval with safe globals
        try:
            return eval(raw_array, {"__builtins__": None}, {})
        except Exception:
            return []


def migrate_theme(slug: str):
    """Migrates a single theme to the new Modern Architecture format."""
    kiosk_theme_dir = os.path.join(THEMES_DIR, slug)
    dgx_theme_dir = os.path.join(DGX_THEMES_DIR, slug)
    
    if not os.path.exists(kiosk_theme_dir):
        print(f"[FAIL] Theme directory not found: {kiosk_theme_dir}")
        return

    print(f"[MIGRATE] Migrating theme: {slug}...")

    # 1. Load clothes mapping from DGX if available
    clothes_mapping = {}
    dgx_mapping_file = os.path.join(dgx_theme_dir, "clothes_mapping.json")
    if os.path.exists(dgx_mapping_file):
        try:
            with open(dgx_mapping_file, "r", encoding="utf-8") as f:
                clothes_mapping = json.load(f)
        except Exception as e:
            print(f"  [WARN] Could not load DGX clothes mapping: {e}")

    # 2. Parse data.js to get poses, clothes, backgrounds
    data_js_file = os.path.join(kiosk_theme_dir, "js", "data.js")
    poses = []
    clothes = []
    backgrounds = []

    if os.path.exists(data_js_file):
        with open(data_js_file, "r", encoding="utf-8") as f:
            js_content = f.read()
        poses = parse_js_array(js_content, "poses")
        clothes = parse_js_array(js_content, "clothes")
        backgrounds = parse_js_array(js_content, "backgrounds")

    # Merge DGX mapping into clothes items
    for item in clothes:
        code = item.get("code")
        if code and code in clothes_mapping:
            item["mapping_desc"] = clothes_mapping[code].get("desc", "")
            item["lighting"] = clothes_mapping[code].get("lighting", "")
        else:
            item["mapping_desc"] = item.get("description", "")
            item["lighting"] = "Warm cinematic lighting"

    # Write unified data.json
    unified_data = {
        "poses": poses,
        "clothes": clothes,
        "backgrounds": backgrounds
    }
    data_json_path = os.path.join(kiosk_theme_dir, "data.json")
    with open(data_json_path, "w", encoding="utf-8") as f:
        json.dump(unified_data, f, indent=2, ensure_ascii=False)
    print(f"  [OK] Saved unified data.json ({len(clothes)} outfits, {len(poses)} poses, {len(backgrounds)} bgs)")

    # 3. Create theme.json
    theme_info = THEME_METADATA.get(slug, {
        "title": slug.upper(),
        "subtitle": "Virtual Try-On",
        "badge": "Featured",
        "icon": "✨",
        "description": "Experience our photobooth in AI.",
        "cta": "Start",
        "status": "live",
        "features": { "luckyNumber": False, "filmStrip": False, "genderFilter": True },
        "style": {},
        "waitingExperience": {}
    })
    theme_info["slug"] = slug

    theme_json_path = os.path.join(kiosk_theme_dir, "theme.json")
    with open(theme_json_path, "w", encoding="utf-8") as f:
        json.dump(theme_info, f, indent=2, ensure_ascii=False)
    print(f"  [OK] Saved theme.json")

    # 4. Create bindings.json using workflow inspection
    bindings = None
    for fname in os.listdir(kiosk_theme_dir):
        if fname.endswith(".json") and "ZIT" in fname:
            wpath = os.path.join(kiosk_theme_dir, fname)
            with open(wpath, "r", encoding="utf-8") as f:
                wdict = json.load(f)
            bindings = inspect_kiosk_workflow(wdict)
            break

    if bindings:
        bindings_json_path = os.path.join(kiosk_theme_dir, "bindings.json")
        with open(bindings_json_path, "w", encoding="utf-8") as f:
            json.dump(bindings, f, indent=2)
        print(f"  [OK] Saved bindings.json (ImageNode={bindings['input_image_node']}, PromptNode={bindings['prompt_node']})")


def migrate_all():
    for slug in ["cny", "uits", "ndp2026", "hariraya"]:
        migrate_theme(slug)
    print("\n[SUCCESS] All existing themes successfully migrated to the modern data schema!")

if __name__ == "__main__":
    migrate_all()
