"""The scan OCR entry point defaults to Paddle (ONNX Runtime) and names engines explicitly."""

import unittest
import unittest.mock
from pathlib import Path
from unittest.mock import patch

from ingestion.lib.paddle_ocr import PaddleConfig
from ingestion.lib.scan_ocr import recognize_image, recognize_pdf, settle_seams
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


class UnitStackTest(unittest.TestCase):
    def page(self, text="円0"):
        return {"page_number": 1, "regions": [{"id": "full-page", "observations": [
            {"id": "p1:full-page:a0:result0:r0", "kind": "region", "parent_id": None, "raw_text": text, "bbox_pdf_pt": [237.5, 100.8, 248.3, 117.8]},
            {"id": "p1:full-page:a0:result0:r0:w0", "kind": "word", "parent_id": "p1:full-page:a0:result0:r0", "raw_text": "円", "bbox_pdf_pt": [237.5, 102.7, 245.7, 109.9]},
            {"id": "p1:full-page:a0:result0:r0:w1", "kind": "word", "parent_id": "p1:full-page:a0:result0:r0", "raw_text": "0", "bbox_pdf_pt": [237.5, 110.8, 245.7, 112.0]}]}]}

    def split(self, page, text):
        import numpy as np
        from ingestion.lib import scan_ocr
        with patch.object(scan_ocr, "_whitened", return_value=np.full((400, 400), 255, np.uint8)), \
                patch.object(scan_ocr.paddle_ocr, "recognize_crops", return_value=[text]):
            scan_ocr.split_unit_stacks(Path("x.pdf"), page, PaddleConfig(dpi=72))
        return page

    def test_a_unit_mark_boxed_with_the_amount_under_it_is_split_at_the_mark(self):
        from ingestion.lib import scan_ocr
        page = self.split(self.page(), " 0 ")
        added = page["regions"][-1]
        self.assertEqual(added["supersedes"], ["p1:full-page:a0:result0:r0"])
        self.assertEqual([(o["raw_text"], o["bbox_pdf_pt"][1], o["bbox_pdf_pt"][3]) for o in added["observations"]],
                         [("0", 109.9, 117.8), ("円", 100.8, 109.9)])
        self.assertEqual(scan_ocr.superseded(page), {"p1:full-page:a0:result0:r0", "p1:full-page:a0:result0:r0:w0",
                                                      "p1:full-page:a0:result0:r0:w1"})

    def test_a_reading_that_is_not_an_amount_leaves_the_merged_box_alone(self):
        page = self.split(self.page(), "O")
        self.assertEqual(len(page["regions"]), 1)

    def test_an_ordinary_line_is_not_split(self):
        page = self.split(self.page("円安"), "0")
        self.assertEqual(len(page["regions"]), 1)


class PageBoxTest(unittest.TestCase):
    def test_a_page_whose_cropbox_differs_from_its_mediabox_is_refused(self):
        import tempfile
        import pypdfium2 as pdfium
        from ingestion.lib.scan_ocr import require_one_page_box
        with tempfile.TemporaryDirectory() as directory:
            same, cropped = Path(directory) / "same.pdf", Path(directory) / "cropped.pdf"
            for path, crop in ((same, None), (cropped, (10, 10, 100, 60))):
                document = pdfium.PdfDocument.new()
                page = document.new_page(200, 100)
                if crop:
                    page.set_cropbox(*crop)
                document.save(str(path))
                document.close()
            require_one_page_box(same, 1)
            with self.assertRaisesRegex(ValueError, "CropBox"):
                require_one_page_box(cropped, 1)


class SeamPairs(unittest.TestCase):
    """A line Paddle dropped at the strip seam comes back whole or is recorded unread, never in part."""

    def page(self, ink):
        # 300 dpi: 1 px = 0.24 pt; the pair's box is [1000, 100, 1400, 140] px = [240, 24, 336, 33.6] pt
        regions = [{"id": "full-page", "observations": [
            {"id": "keep", "kind": "region", "raw_text": "予算", "bbox_pdf_pt": [10, 24, 50, 33]}]}]
        regions += [{"id": f"ink-{i}", "observations": [
            {"id": f"ink-{i}:r0", "kind": "region", "raw_text": text, "bbox_pdf_pt": box},
            {"id": f"ink-{i}:r0:w0", "kind": "word", "parent_id": f"ink-{i}:r0", "raw_text": text, "bbox_pdf_pt": box}]}
            for i, (text, box) in enumerate(ink)]
        return {"page_number": 1, "image_width": 2480, "displayed_pdf_size_pt": [595.2, 841.9], "regions": regions,
                "attempts": [{"id": "p1:full-page:a0", "seam_dropped_boxes_px": [[1000, 100, 1400, 140]]}]}

    def ids(self, page):
        return [o["id"] for region in page["regions"] for o in region["observations"]]

    def test_one_reading_over_the_whole_pair_is_kept(self):
        page = settle_seams(self.page([("負担金、補助及び交付金", [239, 24, 337, 34])]))
        self.assertIn("ink-0:r0", self.ids(page))
        self.assertNotIn("unread_ink", page)

    def test_a_reading_of_only_part_of_the_pair_is_not_taken_and_the_whole_is_unread(self):
        page = settle_seams(self.page([("負担金、補助及び", [240, 24, 290, 34])]))
        self.assertEqual(self.ids(page), ["keep"])
        self.assertEqual(page["unread_ink"], [[240.0, 24.0, 336.0, 33.6]])

    def test_two_pieces_that_together_cover_the_pair_are_still_not_taken(self):
        page = settle_seams(self.page([("負担金、補助及び", [240, 24, 290, 34]), ("及び交付金", [291, 24, 336, 34])]))
        self.assertEqual(self.ids(page), ["keep"])
        self.assertEqual(len(page["unread_ink"]), 1)

    def test_a_pair_nothing_re_read_is_unread(self):
        page = settle_seams(self.page([]))
        self.assertEqual(page["unread_ink"], [[240.0, 24.0, 336.0, 33.6]])

    def test_a_page_with_no_dropped_pair_is_left_alone(self):
        page = self.page([("負担金", [240, 24, 290, 34])])
        page["attempts"] = [{"id": "p1:full-page:a0"}]
        self.assertEqual(settle_seams(page), self.page([("負担金", [240, 24, 290, 34])]) | {"attempts": [{"id": "p1:full-page:a0"}]})


if __name__ == "__main__":
    unittest.main()
