"""
ComfyUI Workflow Inspector & Dynamic Parameter Binder
Analyzes ComfyUI API JSON workflows to automatically discover key node IDs:
- Input Image Node (Base64 loader or image loader)
- Positive Prompt Node (CLIP text encode containing {gender}, {pose}, etc.)
- Sampler Node (KSampler containing seed)
- Face Swap Node (ReActor / FaceID)
- Output Node (WebSocket / SaveImage / Video)
"""

import json
import os
from typing import Dict, Any, Optional

# Standard placeholder tokens expected in photobooth prompts
PROMPT_TOKENS = [
    '"gender"',
    '"gender_style"',
    '"pose"',
    '"clothes_style"',
    '"background"',
    '"lucky_num"',
    '"style_type"',
    '"lighting"',
    '{gender}',
    '{gender_style}',
    '{pose}',
    '{clothes_style}',
    '{background}',
    '{lucky_num}',
    '{style_type}',
    '{lighting}'
]

def inspect_kiosk_workflow(workflow: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analyzes an image generation / face swap ComfyUI API workflow dictionary.
    Returns a dictionary of discovered node bindings and metadata.
    """
    bindings = {
        "input_image_node": None,
        "prompt_node": None,
        "sampler_node": None,
        "face_swap_node": None,
        "output_node": None,
        "detected_tokens": [],
        "confidence": "low"
    }

    if not isinstance(workflow, dict):
        return bindings

    # Scan all nodes
    for node_id, node_data in workflow.items():
        if not isinstance(node_data, dict):
            continue

        class_type = node_data.get("class_type", "")
        inputs = node_data.get("inputs", {})

        # 1. Detect Input Image Node
        # Look for base64 loaders or standard image loaders
        if class_type in ["easy loadImageBase64", "LoadImageBase64", "ETN_LoadImageBase64"]:
            bindings["input_image_node"] = node_id
        elif "base64_data" in inputs and bindings["input_image_node"] is None:
            bindings["input_image_node"] = node_id
        elif class_type in ["LoadImage"] and bindings["input_image_node"] is None:
            bindings["input_image_node"] = node_id

        # 2. Detect Positive Prompt Node
        if class_type == "CLIPTextEncode" and "text" in inputs:
            text = str(inputs["text"])
            matched_tokens = [t for t in PROMPT_TOKENS if t in text]
            if matched_tokens:
                # Node containing prompt placeholders
                bindings["prompt_node"] = node_id
                bindings["detected_tokens"] = matched_tokens

        # 3. Detect Sampler Node
        if class_type in ["KSampler", "KSamplerAdvanced"]:
            if "seed" in inputs or "noise_seed" in inputs:
                bindings["sampler_node"] = node_id
        elif "seed" in inputs and bindings["sampler_node"] is None:
            bindings["sampler_node"] = node_id

        # 4. Detect Face Swap Node
        if class_type in ["ReActorFaceSwap", "ReActorFastFaceSwap", "FaceEmbedDistance"]:
            bindings["face_swap_node"] = node_id

        # 5. Detect Output Node
        if class_type in ["ETN_SendImageWebSocket", "SaveImageWebsocket"]:
            bindings["output_node"] = node_id
        elif class_type in ["SaveImage"] and bindings["output_node"] is None:
            bindings["output_node"] = node_id

    # Calculate confidence
    found_count = sum(1 for k in ["input_image_node", "prompt_node", "sampler_node"] if bindings[k] is not None)
    if found_count == 3:
        bindings["confidence"] = "high"
    elif found_count >= 2:
        bindings["confidence"] = "medium"
    else:
        bindings["confidence"] = "low"

    return bindings


def inspect_video_workflow(workflow: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analyzes an FLF / video generation ComfyUI API workflow dictionary.
    """
    bindings = {
        "original_image_node": None,
        "generated_image_node": None,
        "prompt_node": None,
        "sampler_node": None,
        "video_output_node": None,
        "detected_tokens": [],
        "confidence": "low"
    }

    if not isinstance(workflow, dict):
        return bindings

    image_nodes = []
    for node_id, node_data in workflow.items():
        if not isinstance(node_data, dict):
            continue

        class_type = node_data.get("class_type", "")
        inputs = node_data.get("inputs", {})

        # Collect image loader nodes
        if class_type in ["easy loadImageBase64", "LoadImageBase64", "LoadImage"] or "base64_data" in inputs:
            image_nodes.append(node_id)

        # Detect prompt node with style_type / lighting
        if class_type == "CLIPTextEncode" and "text" in inputs:
            text = str(inputs["text"])
            matched = [t for t in ['"style_type"', '"lighting"', '{style_type}', '{lighting}'] if t in text]
            if matched:
                bindings["prompt_node"] = node_id
                bindings["detected_tokens"] = matched

        # Detect Sampler
        if class_type in ["KSampler", "KSamplerAdvanced"] and "seed" in inputs:
            bindings["sampler_node"] = node_id

        # Detect Video Output
        if class_type in ["VHS_VideoCombine", "SaveVideo", "SaveAnimatedWEBP"]:
            bindings["video_output_node"] = node_id

    # Sort image nodes if found (e.g. 106, 107)
    if len(image_nodes) >= 2:
        # If standard 106/107 exist, prioritize them
        if "106" in image_nodes and "107" in image_nodes:
            bindings["original_image_node"] = "106"
            bindings["generated_image_node"] = "107"
        else:
            image_nodes.sort(key=lambda x: int(x) if x.isdigit() else x)
            bindings["original_image_node"] = image_nodes[0]
            bindings["generated_image_node"] = image_nodes[1]

    found = sum(1 for k in ["original_image_node", "generated_image_node", "prompt_node", "video_output_node"] if bindings[k] is not None)
    bindings["confidence"] = "high" if found >= 3 else ("medium" if found >= 2 else "low")
    return bindings


def load_theme_bindings(theme_dir: str) -> Dict[str, Any]:
    """
    Loads bindings.json from theme folder if present, or auto-inspects the workflow.
    """
    bindings_file = os.path.join(theme_dir, "bindings.json")
    if os.path.exists(bindings_file):
        try:
            with open(bindings_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"⚠️ Error loading bindings.json from {theme_dir}: {e}")

    # Fallback: find workflow JSON in theme_dir and auto-inspect
    for fname in os.listdir(theme_dir):
        if fname.endswith(".json") and ("ZIT" in fname or "workflow" in fname.lower()) and fname != "bindings.json":
            wpath = os.path.join(theme_dir, fname)
            try:
                with open(wpath, "r", encoding="utf-8") as f:
                    workflow = json.load(f)
                    return inspect_kiosk_workflow(workflow)
            except Exception:
                pass

    # Default fallback for backwards compatibility
    return {
        "input_image_node": "65",
        "prompt_node": "45",
        "sampler_node": "44",
        "face_swap_node": "57",
        "output_node": "60",
        "confidence": "default_fallback"
    }
