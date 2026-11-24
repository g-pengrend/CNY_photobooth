"""Dynamic, non-linear MiniMax H3 FL2VA morph prompt builder."""

from __future__ import annotations

import json
import os
import re
from typing import Any


THEME_MORPH_PRESETS: dict[str, dict[str, str]] = {
    "cny": {
        "morphVfx": (
            "swirling crimson-and-gold silk light ribbons, rising lucky lantern embers, "
            "and sparkling gold-leaf dust trails"
        ),
        "morphLighting": "Crimson Red, Warm Gold, and Amber",
        "morphAudio": (
            "warm lantern shimmer building into a brisk celebratory silk whoosh and auspicious gong-chime burst"
        ),
        "morphStyle": "flashy",
    },
    "hariraya": {
        "morphVfx": (
            "glimmering emerald-and-gold arabesque light filigree, floating pelita oil-lamp sparks, "
            "and crescent moonbeam ribbons"
        ),
        "morphLighting": "Emerald Green, Champagne Gold, and Warm Ivory",
        "morphAudio": (
            "gentle tropical breeze and warm lantern chime swelling into a luminous festive whoosh"
        ),
        "morphStyle": "flashy",
    },
    "deepavali_2026": {
        "morphVfx": (
            "rising diya-flame fireflies igniting into a spinning molten-gold rangoli mandala ring "
            "and saffron-magenta sparkler trails"
        ),
        "morphLighting": "Molten Gold, Warm Saffron, and Neon Magenta",
        "morphAudio": (
            "warm glowing firefly hum erupting into a bright celebratory sparkler crackle, "
            "deep cinematic sub-whoosh, and luminous festive chime"
        ),
        "morphStyle": "flashy",
    },
    "merry-christmas-toy-theatre": {
        "morphVfx": (
            "swirling peppermint-gold ribbon tornado, glowing fairy-wand starlight trails, "
            "and sparkling frosted snow-globe crystals"
        ),
        "morphLighting": "Emerald Green, Crimson Red, and Warm Gold",
        "morphAudio": (
            "crisp winter frost shimmer building into a soaring sleigh-bell magical whoosh "
            "and glittering holiday chime burst"
        ),
        "morphStyle": "flashy",
    },
    "ndp2026": {
        "morphVfx": (
            "soaring crimson-and-white light streamers, sparkling star fireworks arcs, "
            "and crisp prism light flares"
        ),
        "morphLighting": "Crimson Red, Crisp White, and Warm Gold",
        "morphAudio": (
            "energetic rising shimmer bursting into a bright firework sparkle whoosh and triumphant chime"
        ),
        "morphStyle": "flashy",
    },
    "uits": {
        "morphVfx": (
            "sweeping liquid-gold architectural light arcs, warm amber dust motes, "
            "and crystal prism glints"
        ),
        "morphLighting": "Liquid Gold, Deep Obsidian, and Warm Amber",
        "morphAudio": (
            "prestigious warm crystalline shimmer swelling into a smooth golden chime flourish"
        ),
        "morphStyle": "flashy",
    },
    "open-air-photobooth": {
        "morphVfx": (
            "flashbulb studio lens glints, crisp white-gold kinetic light streaks, "
            "and sparkling confetti bokeh"
        ),
        "morphLighting": "Crisp Studio White, Warm Gold, and Soft Pastel Bokeh",
        "morphAudio": (
            "playful camera-shutter sparkle swelling into a bright upbeat pop chime whoosh"
        ),
        "morphStyle": "flashy",
    },
    "yuletide-frost-cathedral": {
        "morphVfx": (
            "swirling ice-blue cathedral light beams, frosted crystal snowflakes, "
            "and shimmering silver-gold stardust ribbons"
        ),
        "morphLighting": "Ice Blue, Frosted Silver, and Warm Gold",
        "morphAudio": (
            "crystalline winter bell shimmer building into an ethereal frosted wind whoosh and chime"
        ),
        "morphStyle": "flashy",
    },
    "default": {
        "morphVfx": (
            "dazzling color-matched energy ribbons, swirling luminous stardust trails, "
            "and sparkling bokeh particles"
        ),
        "morphLighting": "Warm Festive Gold and Radiant Ambient Light",
        "morphAudio": (
            "shimmering energy buildup into a crisp magical whoosh, dazzling sparkle cascade, "
            "and warm festive ambience"
        ),
        "morphStyle": "flashy",
    },
}

_GENERIC_LIGHTING_VALUES = {
    "",
    "cinematic ambient studio lighting",
    "warm cinematic lighting",
    "cinematic lighting",
    "crisp editorial studio",
    "studio lighting",
}


def is_generic_lighting(lighting: str | None) -> bool:
    """Return True when an outfit lighting string is empty or a generic placeholder."""
    return (lighting or "").strip().lower() in _GENERIC_LIGHTING_VALUES


def resolve_morph_lighting(outfit_lighting: str | None, theme_lighting: str | None) -> str:
    """Prefer specific outfit accent colors when provided; fall back to theme palette."""
    if outfit_lighting and not is_generic_lighting(outfit_lighting):
        return outfit_lighting.strip()
    if theme_lighting and theme_lighting.strip():
        return theme_lighting.strip()
    return THEME_MORPH_PRESETS["default"]["morphLighting"]


def sanitize_style_desc_for_morph(desc: str | None) -> str:
    """Strip studio boilerplate and full-body footwear/trouser words from clothes description."""
    if not desc:
        return ""
    text = str(desc).strip()
    text = re.sub(r'^(?:prompt|variable description)\s*:\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^A professional studio product shot of.*?featuring\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'The outfit is displayed to maintain.*$', '', text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r'No human hands.*$', '', text, flags=re.IGNORECASE)
    text = re.sub(r'isolated on a solid.*$', '', text, flags=re.IGNORECASE | re.DOTALL)

    text = re.sub(r'\b(?:floor-length|ankle-length)\b', 'tailored', text, flags=re.IGNORECASE)
    text = re.sub(
        r'\bfull-length(?=\s+(?:[\w-]+\s+){0,3}(?:skirt|gown|dress|robe|silhouette|outfit|look|ensemble)\b)',
        'tailored',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r'\bballerina\b', 'holiday princess', text, flags=re.IGNORECASE)
    text = re.sub(
        r'(?:\s*,?\s*\band\s+(?:paired\s+with\s+|finished\s+with\s+)?|\s*,?\s*(?:paired|finished)\s+with\s+)(?:(?!\band\b)[^.;])*?\b(?:trousers|churidar)\b[^.;]*',
        '',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r'(?:\s*,?\s*\band\s+(?:paired\s+with\s+|finished\s+with\s+)?|\s*,?\s*(?:paired|finished)\s+with\s+|\s+)(?:(?!\band\b|\bwith\b)[\w-]+\s+){0,3}(?:ankle\s+boots|leather\s+boots|dress\s+shoes|boots|shoes|sandals|heels)\b',
        '',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r'\s{2,}', ' ', text).strip(' ,.')
    return text


def load_theme_morph_config(base_dir: str, theme_slug: str | None) -> dict[str, str]:
    """Load per-theme morph configuration from dgx_photobooth, kiosk_frontend, or presets."""
    slug = (theme_slug or "default").strip().lower()
    preset = THEME_MORPH_PRESETS.get(slug, THEME_MORPH_PRESETS["default"])
    merged = {**THEME_MORPH_PRESETS["default"], **preset}

    candidate_paths = [
        (os.path.join(base_dir, "templates", "themes", slug, "morph_config.json"), None),
        (
            os.path.abspath(
                os.path.join(base_dir, "..", "kiosk_frontend", "static", "themes", slug, "theme.json")
            ),
            "morphProfile",
        ),
    ]
    for path, nested_key in candidate_paths:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    raw = json.load(f)
                data = raw.get(nested_key, {}) if nested_key else raw
                if isinstance(data, dict):
                    for k in ("morphVfx", "morphLighting", "morphAudio", "morphStyle"):
                        val = str(data.get(k, "")).strip()
                        if val:
                            merged[k] = val
                    if data:
                        break
            except Exception:
                pass
    return merged


def _fmt_ts(seconds: float) -> str:
    return f"00:{seconds:06.3f}"


def build_minimax_h3_morph_prompt(
    theme_config: dict[str, Any] | None,
    style_desc: str = "",
    outfit_lighting: str = "",
    duration_sec: float = 3.75,
) -> str:
    """Build a non-linear 3-phase MiniMax H3 FL2VA prompt with gradual face transformation."""
    cfg = {**THEME_MORPH_PRESETS["default"], **(theme_config or {})}
    morph_style = str(cfg.get("morphStyle", "flashy")).strip().lower()
    morph_vfx = str(cfg.get("morphVfx") or THEME_MORPH_PRESETS["default"]["morphVfx"]).strip()
    theme_lighting = str(cfg.get("morphLighting") or THEME_MORPH_PRESETS["default"]["morphLighting"]).strip()
    morph_audio = str(cfg.get("morphAudio") or THEME_MORPH_PRESETS["default"]["morphAudio"]).strip()

    clean_style = sanitize_style_desc_for_morph(style_desc)
    resolved_lighting = resolve_morph_lighting(outfit_lighting, theme_lighting)

    t1 = round(duration_sec * 0.25, 2)
    t2 = round(duration_sec * 0.72, 2)
    t_end = round(duration_sec, 2)

    header = (
        f"How the reference pictures align with the target video — "
        f"Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; "
        f"Picture 2 (from Shot 1) aligns with the {t_end:.2f}-second mark of the target video."
    )
    face_rule = (
        "No speech or talking; the subject's original face from <Picture 1> stays genuine at the start "
        "and blends gradually and continuously in lighting, grooming, and expression into <Picture 2> "
        "across the full transition rather than snapping abruptly."
    )

    outfit_clause = (
        f"into {clean_style} illuminated in {resolved_lighting} light"
        if clean_style
        else f"into the ornate festive attire of <Picture 2> bathed in {resolved_lighting} light"
    )

    if morph_style == "generic":
        body = (
            f"[Shot 1] Photorealistic live-action portrait transformation starting on <Picture 1>. "
            f"{_fmt_ts(0.0)}-{_fmt_ts(t1)}: Starts locked on <Picture 1>. The subject keeps their authentic face and natural expression from <Picture 1> "
            f"as shimmering luminous energy motes gather around the shoulders and the camera begins a slow anticipation pull-back. "
            f"Then at {_fmt_ts(t1)}-{_fmt_ts(t2)}: Non-linear speed-ramped transformation surge — dazzling energy ribbons, sparkling ember trails, "
            f"and dramatic color-matched light waves spiral rapidly around the torso and background without obscuring facial features, "
            f"borrowing the exact palette, lighting, and festive attire of <Picture 2>. "
            f"The outfit and environment materialize with flashy theatrical flair while the subject moves fluidly into the exact pose of <Picture 2> "
            f"and the face, skin lighting, and expression evolve gradually and continuously throughout the arc rather than morphing abruptly at the start. "
            f"Then at {_fmt_ts(t2)}-{_fmt_ts(t_end)}: The burst scatters into crisp floating bokeh, the ornamental border and title typography flash sharply into place without distortion, "
            f"and the camera decelerates into a steady hero hold on <Picture 2>. {face_rule}"
        )
        soundscape = f"{morph_audio}."
        music = "Dramatic celebratory chime swell resolving cleanly at the end."
    elif morph_style == "showstopper":
        t1_show = round(duration_sec * 0.23, 2)
        t2_show = round(duration_sec * 0.71, 2)
        body = (
            f"[Shot 1] High-impact photorealistic live-action reveal starting on <Picture 1>. "
            f"{_fmt_ts(0.0)}-{_fmt_ts(t1_show)}: Brief dramatic slight push-in anticipation on <Picture 1> — the subject keeps their genuine <Picture 1> face and expression "
            f"while intense {resolved_lighting} sparks ignite behind their shoulders and luminous energy charges up. "
            f"Then at {_fmt_ts(t1_show)}-{_fmt_ts(t2_show)}: Explosive speed-ramp pullback! A radiant shockwave erupts from chest level, unleashing {morph_vfx} "
            f"sweeping across the foreground in vivid 3D parallax without obscuring the face, as the everyday clothes ignite and re-weave dramatically {outfit_clause} "
            f"and the environment bursts open into the illuminated world of <Picture 2>. "
            f"The subject sweeps energetically into the exact pose of <Picture 2> while facial lighting, grooming, and expression transition smoothly and gradually across the entire burst without any abrupt face pop. "
            f"Then at {_fmt_ts(t2_show)}-{_fmt_ts(t_end)}: High-impact lens-flare glint resolves cleanly; decorative border and lettering sparkle crisply into place as the camera snaps to a rock-steady hero hold on <Picture 2>. {face_rule}"
        )
        soundscape = f"Deep cinematic sub-whoosh into {morph_audio}."
        music = "Dramatic high-energy celebratory orchestral sting resolving cleanly."
    else:
        body = (
            f"[Shot 1] Photorealistic live-action portrait transformation starting on <Picture 1>. "
            f"{_fmt_ts(0.0)}-{_fmt_ts(t1)}: Starts locked on <Picture 1>. The subject retains their genuine face and relaxed expression from <Picture 1> "
            f"while glowing {resolved_lighting} light motes gather around the shoulders and the camera starts a subtle slow anticipation pull-back. "
            f"Then at {_fmt_ts(t1)}-{_fmt_ts(t2)}: Non-linear speed-ramped transformation surge — {morph_vfx} sweep dynamically around the torso without covering facial features, "
            f"weaving the everyday clothes cleanly {outfit_clause} as the background blossoms into the festive setting of <Picture 2>. "
            f"The arms, hands, and posture glide smoothly into the exact pose of <Picture 2> while the face, skin lighting, and expression evolve gradually and continuously across the transition. "
            f"Then at {_fmt_ts(t2)}-{_fmt_ts(t_end)}: The swirling VFX dissolve into luminous bokeh, the ornate border and lettering gleam sharply into place without warping, "
            f"and the camera settles into a steady hero hold on <Picture 2>. {face_rule}"
        )
        soundscape = f"{morph_audio}."
        music = "Uplifting celebratory chime swell fading smoothly into warm sparkle."

    return (
        f"{header}\n\n"
        f"integrated_multimodal_description: {body}\n\n"
        f"overall_soundscape: {soundscape}\n\n"
        f"non_diegetic_music: {music}"
    )


def inject_prompt_into_workflow(
    workflow: dict[str, Any],
    prompt_text: str,
    seed: int | None = None,
) -> tuple[bool, str | None]:
    """Inject MiniMax H3 prompt (and optional random noise seed) into the workflow."""
    injected_node: str | None = None
    for node_id, node_data in workflow.items():
        if (
            isinstance(node_data, dict)
            and node_data.get("class_type") == "MiniMaxH3ImageToVideo"
            and isinstance(node_data.get("inputs"), dict)
        ):
            node_data["inputs"]["prompt"] = prompt_text
            injected_node = str(node_id)
            break

    if seed is not None:
        for _nid, node_data in workflow.items():
            if (
                isinstance(node_data, dict)
                and node_data.get("class_type") == "RandomNoise"
                and isinstance(node_data.get("inputs"), dict)
            ):
                node_data["inputs"]["noise_seed"] = int(seed)
                break

    return (injected_node is not None), injected_node
