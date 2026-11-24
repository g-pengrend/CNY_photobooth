#!/usr/bin/env python3
"""Unit tests for portrait-framing & prompt-sanitization guardrails in comfy_processor.py."""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
KIOSK_DIR = REPO_ROOT / "kiosk_frontend"
sys.path.insert(0, str(KIOSK_DIR))

import asset_generator  # noqa: E402
import comfy_processor  # noqa: E402


class TestPromptFramingGuardrails(unittest.TestCase):
    def test_sanitize_pose_removes_feet_stance_ceiling_and_prompt_prefix(self):
        p20 = (
            'Prompt: Facing the camera with one arm raised straight up, index finger pointing '
            'upward to make a number "one" sign, while the other hand rests naturally on the hip. '
            'Feet are set shoulder-width apart with a slight upward tilt of the chin and a proud, '
            'confident open smile.'
        )
        out20 = comfy_processor.sanitize_pose_for_portrait(p20)
        self.assertTrue(out20.startswith("Facing the camera with"))
        self.assertNotIn("Prompt:", out20)
        self.assertNotIn("Feet", out20)
        self.assertNotIn("shoulder-width", out20)
        self.assertNotIn("pointing upward", out20)
        self.assertIn("near shoulder height", out20)

        p21 = (
            "Prompt: Facing the camera with one arm raised straight up into the air with a tightly "
            "clenched fist held high, while the other arm hangs straight down at the side with a "
            "loose, relaxed hand. Feet are planted firmly shoulder-width apart in a solid, unmoving "
            "stance, chest pushed out proudly, chin raised high with eyes looking forward in quiet, "
            "exhausted triumph."
        )
        out21 = comfy_processor.sanitize_pose_for_portrait(p21)
        self.assertTrue(out21.startswith("Facing the camera with"))
        self.assertNotIn("Feet", out21)
        self.assertNotIn("into the air", out21)

        p25 = (
            "Facing the camera with one hand held up to the temple in a cute, flat-palm salute, "
            "the other hand resting straight against the outer thigh. Standing tall with chin "
            "slightly raised and a crisp, friendly smile."
        )
        out25 = comfy_processor.sanitize_pose_for_portrait(p25)
        self.assertNotIn("outer thigh", out25)
        self.assertNotIn("Standing tall", out25)
        self.assertIn("naturally at the waist", out25)
        self.assertIn("With chin slightly raised", out25)

        p31 = (
            "Facing the camera with both arms stretched straight up toward the ceiling, fingers "
            "spread wide open. Standing tall on the toes, head tilted slightly back with eyes "
            "closed and a contented, happy yawn-like smile."
        )
        out31 = comfy_processor.sanitize_pose_for_portrait(p31)
        self.assertNotIn("ceiling", out31)
        self.assertNotIn("toes", out31)
        self.assertNotIn("Standing tall", out31)
        self.assertIn("open. Head tilted slightly back", out31)

        p35 = (
            "Facing the camera with both arms spread wide open to either side at shoulder level, "
            "palms facing forward. Standing balanced with feet slightly apart, chest open, and a "
            "bright, radiant beaming smile."
        )
        out35 = comfy_processor.sanitize_pose_for_portrait(p35)
        self.assertNotIn("feet", out35.lower())
        self.assertIn("forward. Chest open", out35)

        p39 = (
            "Facing the camera with the body angled slightly but chest open, left arm fully extended "
            "pointing high into the upper diagonal, right elbow bent drawing the hand back near the "
            "upper chest below the jawline, standing in a grounded wide stance with a triumphant, "
            "beaming grin."
        )
        out39 = comfy_processor.sanitize_pose_for_portrait(p39)
        self.assertNotIn("wide stance", out39)
        self.assertNotIn("upper diagonal", out39)

    def test_sanitize_clothes_removes_full_body_triggers_and_footwear_preserves_sleeves(self):
        c65 = (
            "A breathtaking, modest gown featuring a fitted, long-sleeve crimson velvet bodice with "
            "a high, elegant mock neckline and gold military-style buttons. The ensemble is completed "
            "with a voluminous, floor-length white tulle skirt that is fully lined and subtly "
            "embroidered with delicate, sparkling gold snowflakes, capturing the magic of a vintage "
            "toy theatre ballerina."
        )
        out65 = comfy_processor.sanitize_clothes_for_portrait(c65)
        self.assertNotIn("floor-length", out65.lower())
        self.assertNotIn("ballerina", out65.lower())
        self.assertIn("high-waisted white tulle skirt", out65)
        self.assertIn("holiday princess", out65)

        c66 = (
            "A cozy, oversized cream and ruby-red Fair Isle knit sweater paired with tailored, "
            "dark evergreen velvet trousers and finished with a delicate gold snowflake pendant "
            "and warm winter ankle boots."
        )
        out66 = comfy_processor.sanitize_clothes_for_portrait(c66)
        self.assertNotIn("boots", out66.lower())
        self.assertNotIn("trousers", out66.lower())
        self.assertIn("gold snowflake pendant", out66)

        c69 = (
            "A thick, cable-knit sweater dress in a rich evergreen hue, cinched at the waist with a "
            "thick brown leather belt and paired with knee-high brown leather boots. A long wool scarf."
        )
        out69 = comfy_processor.sanitize_clothes_for_portrait(c69)
        self.assertNotIn("boots", out69.lower())
        self.assertIn("brown leather belt", out69)

        c71 = (
            "A sophisticated, elegant outfit featuring a tailored deep emerald green velvet blazer "
            "with classic gold military-style buttons. It is worn over a crisp, high-neck ivory "
            "shirt (or fine knit turtleneck) and paired with tailored charcoal wool trousers. A "
            "subtle gold pocket watch chain completes the look."
        )
        out71 = comfy_processor.sanitize_clothes_for_portrait(c71)
        self.assertIn("emerald green velvet blazer", out71)
        self.assertIn("pocket watch chain", out71)
        self.assertNotIn("trousers", out71.lower())

        c12 = (
            "Deep royal purple Anarkali gown with full-length flowy skirt. The sleeves are "
            "full-length with matching gold embroidery and full-length cuffed sleeves."
        )
        out12 = comfy_processor.sanitize_clothes_for_portrait(c12)
        self.assertNotIn("full-length flowy skirt", out12.lower())
        self.assertIn("full-length cuffed sleeves", out12)

        c57 = (
            "A dynamic, full-length menswear silhouette in warm copper. The base piece is a "
            "knee-length mulberry silk kurta. The look is grounded with slim, straight-cut terracotta "
            "silk trousers tailored precisely to break cleanly at the instep. High tactile contrast."
        )
        out57 = comfy_processor.sanitize_clothes_for_portrait(c57)
        self.assertNotIn("full-length menswear silhouette", out57.lower())
        self.assertNotIn("knee-length", out57.lower())
        self.assertNotIn("trousers", out57.lower())
        self.assertNotIn("instep", out57.lower())
        self.assertIn("High tactile contrast", out57)

    def test_sanitize_background_strips_wide_shot_and_preserves_cny_and_hariraya(self):
        b48 = (
            "A cinematic, mid-distance view at night of a magical, snowy Christmas toy theatre stage. "
            "The foreground and center feature an open, beautifully lit snow-covered platform designed "
            "as a clear stage for a photobooth subject, elegantly framed by giant peppermint candy canes."
        )
        out48 = comfy_processor.sanitize_background_for_portrait(b48)
        self.assertNotIn("mid-distance", out48.lower())
        self.assertNotIn("clear stage for", out48.lower())
        self.assertNotIn("toy theatre stage", out48.lower())
        self.assertTrue(out48.startswith("A magical, snowy Christmas toy theatre backdrop."))
        self.assertIn("Framed by giant peppermint candy canes", out48)

        b50 = (
            "Step into a grand, illuminated Victorian toy theatre surrounded by a snowy gingerbread "
            "village. The central stage remains beautifully clear for your subjects, framed by festive garlands."
        )
        out50 = comfy_processor.sanitize_background_for_portrait(b50)
        self.assertFalse(out50.lower().startswith("step into"))
        self.assertNotIn("central stage remains", out50.lower())
        self.assertIn("Framed by festive garlands", out50)

        b33 = (
            "A clean, eye-level street landscape down the dead-center median of Serangoon Road at 3:00 AM, "
            "vanishing into a single point on the horizon. Ultra-detailed, cinematic wide shot, sharp "
            "focus from foreground to background."
        )
        out33 = comfy_processor.sanitize_background_for_portrait(b33)
        self.assertNotIn("wide shot", out33.lower())
        self.assertNotIn("sharp focus from foreground", out33.lower())
        self.assertNotIn("vanishing into a single point", out33.lower())
        self.assertIn("Serangoon Road", out33)

        b43 = (
            "A nostalgic, neon-lit 80s roller rink with a glossy floor.\n"
            "Prompt: A cinematic, wide-angle view of a vintage 1980s roller rink backdrop."
        )
        out43 = comfy_processor.sanitize_background_for_portrait(b43)
        self.assertEqual(out43, "A vintage 1980s roller rink backdrop.")

        # Original CNY & Hari Raya backgrounds must stay 100% unchanged
        cny_b01 = (
            "A misty mountain summit at dawn, with the silhouette of a massive, glowing celestial "
            "dragon weaving through ancient, gnarled pine trees."
        )
        self.assertEqual(comfy_processor.sanitize_background_for_portrait(cny_b01), cny_b01)

        hr_b01 = (
            "an elegant colonial-era veranda in Singapore, with gleaming emerald-green Peranakan "
            "floor tiles and white louvered shutters."
        )
        self.assertEqual(comfy_processor.sanitize_background_for_portrait(hr_b01), hr_b01)

    def test_sanitize_gender_style_persona_only(self):
        self.assertEqual(
            comfy_processor.sanitize_gender_style("asian, fit and charismatic", "male"),
            "asian, fit and charismatic",
        )
        self.assertEqual(
            comfy_processor.sanitize_gender_style(
                "Simple classic holiday sweater over a collared shirt.", "male"
            ),
            "asian, fit and charismatic",
        )
        self.assertEqual(
            comfy_processor.sanitize_gender_style(
                "Simple elegant festive red dress with long sleeves.", "female"
            ),
            "charismatic, radiant and photogenic",
        )
        self.assertEqual(
            comfy_processor.sanitize_gender_style(
                "executive leading man in tailored dinner suit", "male"
            ),
            "executive leading man",
        )

    def test_asset_generator_sanitizes_prompt_prefix(self):
        cleaned = asset_generator.sanitize_asset_prompt(
            "Summary line\nPrompt: Facing the camera with a bright smile.", "pose"
        )
        self.assertEqual(cleaned, "Facing the camera with a bright smile.")

    def test_end_to_end_update_workflow_with_image_xmas_cny_and_hariraya(self):
        with tempfile.NamedTemporaryFile(suffix=".png") as tmp:
            Image.new("RGB", (64, 64), color=(120, 140, 160)).save(tmp.name)

            # Xmas workflow: Medium shot upgraded with Extreme Close up opener + Upper body closer + sanitized vars
            xmas_dir = REPO_ROOT / "kiosk_frontend" / "static" / "themes" / "merry-christmas-toy-theatre"
            with open(xmas_dir / "workflow_kiosk.json", "r", encoding="utf-8") as f:
                xmas_wf = json.load(f)
            updated_xmas = comfy_processor.update_workflow_with_image(
                xmas_wf,
                tmp.name,
                gender="male",
                pose="Facing the camera with both arms stretched straight up toward the ceiling. Standing tall on the toes.",
                clothes_style="A tailored deep emerald green velvet blazer paired with dark brown leather dress shoes and wool trousers.",
                background="A cinematic, mid-distance view at night of a snowy Christmas toy theatre stage. The central stage remains beautifully clear for your subjects, framed by candy canes.",
                bindings={"input_image_node": "65", "prompt_node": "45", "face_swap_node": "57"},
                theme_dir=str(xmas_dir),
            )
            xmas_prompt = updated_xmas["45"]["inputs"]["text"]
            self.assertTrue(xmas_prompt.startswith("Extreme Close up shot of"))
            self.assertIn("Upper body shot", xmas_prompt)
            self.assertNotIn("Medium shot, waist up shot of", xmas_prompt)
            self.assertNotIn("ceiling", xmas_prompt.lower())
            self.assertNotIn("toes", xmas_prompt.lower())
            self.assertNotIn("shoes", xmas_prompt.lower())
            self.assertNotIn("trousers", xmas_prompt.lower())
            self.assertNotIn("mid-distance", xmas_prompt.lower())
            self.assertNotIn("central stage remains", xmas_prompt.lower())
            self.assertNotIn("holiday sweater", xmas_prompt.lower())
            self.assertIn("asian, fit and charismatic", xmas_prompt)

            # CNY workflow: Extreme Close up shot of preserved verbatim (no injected closer)
            cny_dir = REPO_ROOT / "kiosk_frontend" / "static" / "themes" / "cny"
            with open(cny_dir / "ZIT_FaceSwapAPI(CNY).json", "r", encoding="utf-8") as f:
                cny_wf = json.load(f)
            updated_cny = comfy_processor.update_workflow_with_image(
                cny_wf,
                tmp.name,
                gender="male",
                pose="A classic, high-energy idol pose with a playful wink and a V sign close to the smiling face",
                clothes_style="crimson velvet jacket",
                background="Dragon's peak at dawn",
                bindings={"input_image_node": "65", "prompt_node": "45", "face_swap_node": "57"},
                theme_dir=str(cny_dir),
            )
            cny_prompt = updated_cny["45"]["inputs"]["text"]
            self.assertTrue(cny_prompt.startswith("Extreme Close up shot of"))
            self.assertNotIn(comfy_processor.DEFAULT_PORTRAIT_CLOSER, cny_prompt)

            # Hari Raya workflow: preserved verbatim
            hr_dir = REPO_ROOT / "kiosk_frontend" / "static" / "themes" / "hariraya"
            with open(hr_dir / "ZIT_FaceSwapAPI(HR).json", "r", encoding="utf-8") as f:
                hr_wf = json.load(f)
            updated_hr = comfy_processor.update_workflow_with_image(
                hr_wf,
                tmp.name,
                gender="male",
                pose="Facing forward, looking at the camera",
                clothes_style="Baju Melayu gold songket",
                background="an elegant colonial-era veranda in Singapore",
                bindings={"input_image_node": "65", "prompt_node": "45", "face_swap_node": "57"},
                theme_dir=str(hr_dir),
            )
            hr_prompt = updated_hr["45"]["inputs"]["text"]
            self.assertTrue(hr_prompt.startswith("Extreme Close up shot of"))
            self.assertNotIn(comfy_processor.DEFAULT_PORTRAIT_CLOSER, hr_prompt)


if __name__ == "__main__":
    unittest.main()
