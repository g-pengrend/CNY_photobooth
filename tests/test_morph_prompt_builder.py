#!/usr/bin/env python3
"""Unit tests for MiniMax H3 dynamic morph prompt builder and outfit color extraction."""

import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DGX_DIR = REPO_ROOT / "dgx_photobooth"
KIOSK_DIR = REPO_ROOT / "kiosk_frontend"
sys.path.insert(0, str(DGX_DIR))
sys.path.insert(0, str(KIOSK_DIR))

import asset_generator  # noqa: E402
import morph_prompt_builder as mpb  # noqa: E402


class TestMorphPromptBuilder(unittest.TestCase):
    def test_extract_outfit_lighting_from_prompt(self):
        self.assertEqual(
            asset_generator.extract_outfit_lighting_from_prompt(
                "A tailored deep emerald green velvet blazer with gold military buttons over a crisp ivory shirt."
            ),
            "Emerald Green, Warm Gold, and Crisp Ivory",
        )
        self.assertEqual(
            asset_generator.extract_outfit_lighting_from_prompt(
                "Mulberry silk kurta in copper and antique bronze tones.", "deepavali_2026"
            ),
            "Copper and Antique Bronze",
        )
        self.assertEqual(
            asset_generator.extract_outfit_lighting_from_prompt("Classic dark textured wool jacket.", "cny"),
            "Warm Golden and Scarlet",
        )
        self.assertEqual(
            asset_generator.extract_outfit_lighting_from_prompt("Classic dark textured jacket.", "xmas"),
            "Warm Festive Gold",
        )

    def test_sanitize_style_desc_for_morph(self):
        cleaned = mpb.sanitize_style_desc_for_morph(
            "A professional studio product shot of a standalone female outfit, featuring "
            "a fitted crimson velvet bodice and floor-length white tulle skirt like a vintage ballerina "
            "paired with warm winter ankle boots."
        )
        self.assertNotIn("professional studio", cleaned.lower())
        self.assertNotIn("floor-length", cleaned.lower())
        self.assertNotIn("ballerina", cleaned.lower())
        self.assertNotIn("boots", cleaned.lower())
        self.assertIn("crimson velvet bodice", cleaned)

    def test_resolve_morph_lighting_prefers_specific_over_generic(self):
        self.assertEqual(
            mpb.resolve_morph_lighting("Cinematic ambient studio lighting", "Molten Gold and Magenta"),
            "Molten Gold and Magenta",
        )
        self.assertEqual(
            mpb.resolve_morph_lighting("Emerald Green and Gold", "Molten Gold and Magenta"),
            "Emerald Green and Gold",
        )

    def test_load_theme_morph_config_precedence(self):
        with tempfile.TemporaryDirectory() as tmp:
            tdir = Path(tmp) / "templates" / "themes" / "deepavali_2026"
            tdir.mkdir(parents=True)
            # Preset fallback when morph_config.json doesn't exist
            cfg_preset = mpb.load_theme_morph_config(tmp, "deepavali_2026")
            self.assertIn("rangoli mandala", cfg_preset["morphVfx"])

            # Custom morph_config.json overrides preset cleanly
            (tdir / "morph_config.json").write_text(
                json.dumps(
                    {
                        "morphVfx": "custom lotus sparkler ring",
                        "morphLighting": "Gold and Royal Violet",
                        "morphAudio": "custom sparkler chime",
                        "morphStyle": "showstopper",
                    }
                ),
                encoding="utf-8",
            )
            cfg_custom = mpb.load_theme_morph_config(tmp, "deepavali_2026")
            self.assertEqual(cfg_custom["morphVfx"], "custom lotus sparkler ring")
            self.assertEqual(cfg_custom["morphStyle"], "showstopper")

    def test_build_minimax_h3_morph_prompt_modes(self):
        cfg = mpb.THEME_MORPH_PRESETS["merry-christmas-toy-theatre"]

        p_flashy = mpb.build_minimax_h3_morph_prompt(
            cfg,
            style_desc="tailored deep emerald velvet blazer",
            outfit_lighting="Emerald Green and Warm Gold",
            duration_sec=3.75,
        )
        self.assertIn("3.75-second mark", p_flashy)
        self.assertIn("00:00.000-00:00.940", p_flashy)
        self.assertIn("Then at 00:00.940-00:02.700", p_flashy)
        self.assertIn("Then at 00:02.700-00:03.750", p_flashy)
        self.assertIn("peppermint-gold ribbon tornado", p_flashy)
        self.assertIn("tailored deep emerald velvet blazer", p_flashy)
        self.assertIn("blends gradually and continuously", p_flashy)
        self.assertNotIn("Mouth closed throughout", p_flashy)
        self.assertIn("overall_soundscape:", p_flashy)
        self.assertIn("non_diegetic_music:", p_flashy)

        p_show = mpb.build_minimax_h3_morph_prompt(
            {**cfg, "morphStyle": "showstopper"},
            style_desc="crimson velvet bodice",
            outfit_lighting="Cinematic ambient studio lighting",
            duration_sec=3.75,
        )
        self.assertIn("Explosive speed-ramp pullback", p_show)
        self.assertIn(cfg["morphLighting"], p_show)

        p_gen = mpb.build_minimax_h3_morph_prompt(
            {**cfg, "morphStyle": "generic"},
            style_desc="ignored in generic",
            outfit_lighting="",
            duration_sec=3.75,
        )
        self.assertIn("dazzling energy ribbons", p_gen)
        self.assertNotIn("ignored in generic", p_gen)

    def test_inject_prompt_into_h3_workflow_template(self):
        tpl_path = DGX_DIR / "templates" / "FLF_MiniMax_H3_API.json"
        self.assertTrue(tpl_path.exists())
        wf = json.loads(tpl_path.read_text(encoding="utf-8"))
        prompt = mpb.build_minimax_h3_morph_prompt(
            mpb.THEME_MORPH_PRESETS["cny"],
            style_desc="crimson velvet jacket",
            outfit_lighting="Crimson and Gold",
        )
        ok, nid = mpb.inject_prompt_into_workflow(wf, prompt, seed=123456)
        self.assertTrue(ok)
        self.assertEqual(nid, "6")
        self.assertEqual(wf["6"]["inputs"]["prompt"], prompt)
        self.assertEqual(wf["7"]["inputs"]["noise_seed"], 123456)
        self.assertEqual(wf["6"]["inputs"]["length"], 90)
        self.assertEqual(wf["6"]["inputs"]["width"], 384)
        self.assertEqual(wf["6"]["inputs"]["height"], 576)


if __name__ == "__main__":
    unittest.main()
