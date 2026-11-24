#!/usr/bin/env python3
"""Unit tests for dual face-mode routing (ReActor vs AusBoss Qwen 2.1 Head Swap)."""

import io
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
KIOSK_DIR = REPO_ROOT / "kiosk_frontend"
sys.path.insert(0, str(KIOSK_DIR))

import app as kiosk_app  # noqa: E402
import comfy_processor  # noqa: E402


class TestFaceModePipeline(unittest.TestCase):
    def test_normalize_face_mode(self):
        self.assertEqual(comfy_processor.normalize_face_mode(None), "reactor")
        self.assertEqual(comfy_processor.normalize_face_mode(""), "reactor")
        self.assertEqual(comfy_processor.normalize_face_mode("reactor"), "reactor")
        self.assertEqual(comfy_processor.normalize_face_mode("playful"), "reactor")
        for alias in ("qwen21", "Qwen", "preserve", "preserve_full_face", "full_face"):
            self.assertEqual(comfy_processor.normalize_face_mode(alias), "qwen21")

    def test_strip_reactor_from_real_theme_workflows(self):
        rel_paths = [
            "static/themes/uits/ZIT_FaceSwapAPI(uits).json",
            "static/themes/cny/ZIT_FaceSwapAPI(CNY).json",
            "static/themes/deepavali_2026/workflow_kiosk.json",
        ]
        for rel in rel_paths:
            wf_path = KIOSK_DIR / rel
            if not wf_path.exists():
                continue
            wf = json.loads(wf_path.read_text(encoding="utf-8"))
            stripped = comfy_processor.strip_reactor_from_workflow(wf)
            self.assertNotIn("57", stripped, f"ReActor not stripped in {rel}")
            self.assertNotIn("65", stripped, f"Orphan preview image node not stripped in {rel}")
            self.assertEqual(stripped["60"]["class_type"], "SaveImage")
            self.assertEqual(stripped["60"]["inputs"]["images"], ["43", 0])
            self.assertIn("57", wf)  # original dict untouched

    def test_build_qwen21_head_swap_workflow_graph(self):
        wf = comfy_processor.build_qwen21_head_swap_workflow(
            base_image_b64="BASE64",
            guest_image_b64="GUEST64",
            base_size=(832, 1248),
            guest_size=(960, 1280),
            seed=999,
            save_prefix="unit_qwen",
        )
        self.assertEqual(wf["1"]["inputs"]["unet_name"], comfy_processor.QWEN21_UNET)
        self.assertEqual(wf["2"]["inputs"]["lora_name"], comfy_processor.QWEN21_TURBO_LORA)
        self.assertEqual(wf["3"]["inputs"]["lora_name"], comfy_processor.QWEN21_HEAD_LORA)
        self.assertEqual(wf["4"]["class_type"], "QwenImage21Cache")
        self.assertEqual(wf["5"]["inputs"]["clip_name"], comfy_processor.QWEN21_CLIP)
        self.assertEqual(wf["6"]["inputs"]["vae_name"], comfy_processor.QWEN21_VAE)

        self.assertEqual(wf["7r"]["inputs"]["fit"], "crop")
        self.assertEqual(wf["8r"]["inputs"]["fit"], "crop")
        for nid in ("7r", "8r"):
            self.assertEqual(wf[nid]["inputs"]["width"] % 32, 0)
            self.assertEqual(wf[nid]["inputs"]["height"] % 32, 0)

        enc = wf["10"]
        self.assertEqual(enc["class_type"], "TextEncodeQwenImage21")
        self.assertEqual(enc["inputs"]["images.image_1"], ["7r", 0])
        self.assertEqual(enc["inputs"]["images.image_2"], ["8r", 0])
        self.assertNotIn("images.image_0", enc["inputs"])
        self.assertNotIn("eyeglasses", enc["inputs"]["prompt"].lower())
        self.assertNotIn("glasses", enc["inputs"]["prompt"].lower())
        self.assertIn(
            "strictly preserving the hair, eye color, nose structure from <image2>",
            enc["inputs"]["prompt"],
        )

        self.assertEqual(wf["11"]["inputs"]["steps"], 8)
        self.assertEqual(wf["11"]["inputs"]["seed"], 999)
        self.assertEqual(wf["13"]["inputs"]["filename_prefix"], "unit_qwen")

    def test_flask_process_route_stores_face_mode(self):
        def _img_bytes():
            buf = io.BytesIO()
            Image.new("RGB", (64, 64), (120, 80, 40)).save(buf, format="JPEG")
            buf.seek(0)
            return buf

        client = kiosk_app.app.test_client()
        created_files = []
        try:
            with mock.patch("app.process_image_async") as mock_async:
                resp_q = client.post(
                    "/api/process",
                    data={
                        "theme": "cny",
                        "gender": "male",
                        "face_mode": "qwen21",
                        "image": (_img_bytes(), "guest.jpg"),
                    },
                    content_type="multipart/form-data",
                )
                self.assertEqual(resp_q.status_code, 202)
                jid_q = resp_q.get_json()["job_id"]
                created_files.append(Path(kiosk_app.jobs[jid_q]["input_file"]))
                self.assertEqual(kiosk_app.jobs[jid_q]["face_mode"], "qwen21")
                self.assertEqual(mock_async.call_args.args[-1], "qwen21")

                resp_def = client.post(
                    "/api/process",
                    data={
                        "theme": "cny",
                        "gender": "female",
                        "image": (_img_bytes(), "guest2.jpg"),
                    },
                    content_type="multipart/form-data",
                )
                self.assertEqual(resp_def.status_code, 202)
                jid_def = resp_def.get_json()["job_id"]
                created_files.append(Path(kiosk_app.jobs[jid_def]["input_file"]))
                self.assertEqual(kiosk_app.jobs[jid_def]["face_mode"], "reactor")
                self.assertEqual(mock_async.call_args.args[-1], "reactor")
        finally:
            for p in created_files:
                p.unlink(missing_ok=True)

    def test_all_themes_and_universal_engine_have_face_mode_screen(self):
        engine_html = (KIOSK_DIR / "static" / "engine" / "kiosk.html").read_text(encoding="utf-8")
        self.assertIn('id="face-mode-screen"', engine_html)

        themes_dir = KIOSK_DIR / "static" / "themes"
        theme_dirs = [p for p in themes_dir.iterdir() if p.is_dir()]
        self.assertGreater(len(theme_dirs), 0)
        for tdir in theme_dirs:
            custom_idx = tdir / "index.html"
            if custom_idx.exists():
                html = custom_idx.read_text(encoding="utf-8")
                self.assertIn(
                    'id="face-mode-screen"',
                    html,
                    f"Custom theme index.html missing #face-mode-screen: {tdir.name}",
                )

    def test_theme_builder_enables_face_mode_selection_by_default(self):
        admin_html = (KIOSK_DIR / "static" / "admin" / "index.html").read_text(encoding="utf-8")
        self.assertIn('id="chk-face-mode" type="checkbox" checked', admin_html)
        self.assertIn('id="chk-face-mode-adv" type="checkbox" checked', admin_html)

        admin_js = (KIOSK_DIR / "static" / "admin" / "admin.js").read_text(encoding="utf-8")
        self.assertIn("faceModeSelection: true", admin_js)
        self.assertIn('"faceModeSelection": true', admin_js)

        client = kiosk_app.app.test_client()
        fallback_resp = client.get("/api/theme/__unit_nonexistent_draft__")
        self.assertEqual(fallback_resp.status_code, 200)
        self.assertTrue(fallback_resp.get_json()["features"]["faceModeSelection"])


if __name__ == "__main__":
    unittest.main()
