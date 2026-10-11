"""The scan OCR entry point defaults to Vision and names engines explicitly."""

import unittest
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

    def test_vision_is_the_default(self):
        name, vision, paddle = self.call()
        self.assertEqual(name, "vision")
        self.assertEqual(vision.call_count, 1)
        self.assertEqual(paddle.call_count, 0)
        self.assertIsInstance(vision.call_args.kwargs["config"], VisionConfig)

    def test_paddle_is_selected_by_backend_name(self):
        name, vision, paddle = self.call(backend="paddle")
        self.assertEqual(name, "paddle")
        self.assertEqual(paddle.call_count, 1)
        self.assertEqual(vision.call_count, 0)

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
            recognize_pdf(Path("input.pdf"), pages=[1],
                          retry_regions={1: [OcrRegion("cell", (0, 0, 1, 1))]})
        with self.assertRaises(ValueError):
            recognize_image(Path("input.png"),
                            retry_regions=[OcrRegion("cell", (0, 0, 1, 1))])


if __name__ == "__main__":
    unittest.main()
