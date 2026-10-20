"""The scan OCR entry point defaults to Paddle (ONNX Runtime) and names engines explicitly."""

import unittest
import unittest.mock
from pathlib import Path
from unittest.mock import patch

from ingestion.lib.paddle_ocr import PaddleConfig
from ingestion.lib.scan_ocr import recognize_image, recognize_pdf
from ingestion.lib.vision_ocr import OcrRegion, VisionConfig


class BackendSelection(unittest.TestCase):
    def call(self, **kwargs):
        with patch("ingestion.lib.scan_ocr.vision_ocr.recognize_pdf",
                   return_value={"engine": {"name": "vision"}}) as vision, \
                patch("ingestion.lib.scan_ocr.paddle_ocr.recognize_pdf",
                      return_value={"engine": {"name": "paddle"}}) as paddle:
            result = recognize_pdf(Path("input.pdf"), pages=[1], **kwargs)
            return result["engine"]["name"], vision, paddle

    def test_paddle_is_the_default(self):
        name, vision, paddle = self.call()
        self.assertEqual(name, "paddle")
        self.assertEqual(paddle.call_count, 1)
        self.assertEqual(vision.call_count, 0)
        config = paddle.call_args.kwargs["config"]
        self.assertIsInstance(config, PaddleConfig)
        self.assertEqual((config.runtime, config.cpu_threads), ("onnxruntime", 4))

    def test_paddle_is_the_default_for_images(self):
        with patch("ingestion.lib.scan_ocr.vision_ocr.recognize_image",
                   return_value={"engine": {"name": "vision"}}) as vision, \
                patch("ingestion.lib.scan_ocr.paddle_ocr.recognize_image",
                      return_value={"engine": {"name": "paddle"}}) as paddle:
            self.assertEqual(recognize_image(Path("input.png"))["engine"]["name"], "paddle")
            self.assertEqual((vision.call_count, paddle.call_count), (0, 1))

    def test_vision_is_selected_by_backend_name(self):
        name, vision, paddle = self.call(backend="vision")
        self.assertEqual(name, "vision")
        self.assertEqual((vision.call_count, paddle.call_count), (1, 0))
        self.assertIsInstance(vision.call_args.kwargs["config"], VisionConfig)

    def test_config_type_still_names_the_engine_so_legacy_paddle_callers_work(self):
        name, _, paddle = self.call(config=PaddleConfig())
        self.assertEqual(name, "paddle")
        self.assertEqual(paddle.call_count, 1)
        name, vision, _ = self.call(config=VisionConfig())
        self.assertEqual(name, "vision")
        self.assertEqual(vision.call_count, 1)

    def test_mismatched_backend_and_config_are_rejected(self):
        for kwargs in [{"backend": "paddle", "config": VisionConfig()},
                       {"backend": "vision", "config": PaddleConfig()}]:
            with self.assertRaises(ValueError):
                recognize_pdf(Path("input.pdf"), pages=[1], **kwargs)

    def test_unknown_backend_is_not_substituted(self):
        with self.assertRaises(ValueError):
            recognize_pdf(Path("input.pdf"), pages=[1], backend="tesseract")

    def test_vision_rejects_paddle_retry_regions(self):
        with self.assertRaises(ValueError):
            recognize_pdf(Path("input.pdf"), pages=[1], backend="vision",
                          retry_regions={1: [OcrRegion("cell", (0, 0, 1, 1))]})
        with self.assertRaises(ValueError):
            recognize_image(Path("input.png"), backend="vision",
                            retry_regions=[OcrRegion("cell", (0, 0, 1, 1))])


class PaddleRereadTest(unittest.TestCase):
    def test_a_tight_area_is_read_as_a_small_region_and_named_after_its_page(self):
        import numpy as np
        from ingestion.lib import scan_ocr
        page = {"page_number": 1, "attempts": [], "regions": [{"id": "ink-0", "attempt_ids": ["p1:ink-0:a0"], "observations": [
            {"id": "p1:ink-0:a0:result0:r0", "parent_id": None, "attempt_id": "p1:ink-0:a0", "kind": "region",
             "raw_text": "0", "bbox_px": [10, 10, 30, 40]}]}]}
        engine = unittest.mock.Mock()
        engine.recognize_image.return_value = {"pages": [page]}
        with patch.object(scan_ocr, "_whitened", return_value=np.full((100, 200), 255, np.uint8)), \
                patch.object(scan_ocr, "_paddle", return_value=engine):
            read = scan_ocr._read_without_rules(Path("x.pdf"), 7, PaddleConfig(), [OcrRegion("ink-0", (0, 0, 1, 1))], 100.0)
        self.assertTrue(engine.recognize_image.call_args.kwargs["small_regions"])
        item = read["regions"][0]["observations"][0]
        self.assertEqual((item["id"], item["page_number"], item["bbox_pdf_pt"]), ("p7:ink-0:a0:result0:r0", 7, [5.0, 5.0, 15.0, 20.0]))
        self.assertNotIn("attempts", read)


if __name__ == "__main__":
    unittest.main()
