"""Public input boundaries; real PDF/geometry checks belong to integration."""
import tempfile
import unittest
from pathlib import Path

from ingestion.lib.paddle_ocr import OcrRegion, PaddleConfig, PaddleOcr, PaddleOcrError, _checked_models, _drop_strip_duplicates, _render_pdf, _strips


class PublicBoundaries(unittest.TestCase):
    def test_invalid_configuration(self):
        for config in ({"dpi": True}, {"dpi": 601}, {"max_pixels": 0},
                       {"cpu_threads": 0}, {"recognition_batch_size": True},
                       {"detection_limit_side_len": 0}, {"pdf_renderer": "auto"},
                       {"runtime": "tensorrt"}, {"page_strips": 0}, {"strip_overlap_px": -1},
                       {"render_timeout_seconds": float("nan")}):
            with self.subTest(config=config), self.assertRaises(ValueError):
                PaddleConfig(**config)

    def test_the_measured_best_settings_are_the_default(self):
        config = PaddleConfig()
        self.assertEqual((config.runtime, config.cpu_threads, config.page_strips, config.strip_overlap_px,
                          config.detection_limit_side_len, config.pdf_renderer, config.dpi),
                         ("onnxruntime", 4, 2, 60, 1920, "pypdfium2", 300))

    def test_pypdfium2_renders_the_page_at_the_requested_dpi(self):
        import pypdfium2 as pdfium
        with tempfile.TemporaryDirectory() as directory:
            pdf = Path(directory) / "blank.pdf"
            document = pdfium.PdfDocument.new()
            document.new_page(144, 72)
            document.save(str(pdf))
            document.close()
            render = _render_pdf(pdf, [1], PaddleConfig(dpi=144), Path(directory))
            self.assertEqual((render["renderer"], render["pages"][0]["displayed_pdf_size_pt"]), ("pypdfium2", [144, 72]))
            from PIL import Image
            with Image.open(render["pages"][0]["image_path"]) as image:
                self.assertEqual(image.size, (288, 144))
            with self.assertRaisesRegex(PaddleOcrError, "no physical page 2"):
                _render_pdf(pdf, [2], PaddleConfig(), Path(directory))

    def test_a_pdfium_render_that_does_not_finish_in_time_stops_the_acquisition(self):
        import time
        from unittest.mock import patch
        from ingestion.lib import paddle_ocr
        with patch.object(paddle_ocr, "_render_pdfium", side_effect=lambda *args: time.sleep(5)):
            with self.assertRaisesRegex(PaddleOcrError, "did not finish within"):
                _render_pdf(Path("x.pdf"), [1], PaddleConfig(render_timeout_seconds=0.05), Path("."))

    def test_a_line_read_in_two_strips_is_kept_once_with_its_words(self):
        def line(id, text, box, parent=None, kind="region"):
            return {"id": id, "parent_id": parent, "kind": kind, "raw_text": text, "bbox_px": box}
        left = [line("a", "1,234", [90, 10, 130, 20]), line("a:w0", "1,234", [90, 10, 130, 20], "a", "word"),
                line("c", "合計", [10, 10, 40, 20])]
        right = [line("b", "1,234", [92, 10, 132, 20]), line("b:w0", "1,234", [92, 10, 132, 20], "b", "word"),
                 line("d", "1,2", [95, 40, 115, 50]), line("e", "1,23", [100, 40, 140, 50])]
        # strip 0 is x 0..140 and strip 1 is x 80..220; "a" sits 10px from strip 0's edge, "b" 52px from strip 1's
        kept, dropped = _drop_strip_duplicates([left, right], [(0, 140), (80, 220)])
        self.assertEqual(dropped, ["a"])
        self.assertEqual(sorted(o["id"] for o in kept), ["b", "b:w0", "c", "d", "e"])

    def test_a_line_crossing_the_seam_is_read_in_two_cut_pieces_and_neither_is_kept(self):
        def line(id, text, box):
            return {"id": id, "parent_id": None, "kind": "region", "raw_text": text, "bbox_px": box}
        # A4 at 300dpi in two strips: the seam is the middle, each strip reaches 60px past it.
        spans = [(0, 1300), (1180, 2480)]
        groups = [[line("a", "1,234", [1000, 10, 1300, 20]), line("n", "負担金、補助及び", [200, 40, 1300, 50])],
                  [line("b", "4,567", [1180, 10, 1400, 20]), line("m", "及び交付金", [1180, 40, 1500, 50]),
                   line("other", "予算", [1200, 80, 1400, 90])]]
        kept, dropped = _drop_strip_duplicates(groups, spans)
        self.assertEqual(dropped, ["a", "b", "m", "n"])
        self.assertEqual([o["id"] for o in kept], ["other"])
        from ingestion.lib.paddle_ocr import _merge_strips
        _, _, seams = _merge_strips(groups, spans)
        # the box covering each dropped pair: where the re-read has to give the whole line back
        self.assertEqual(seams, [[1000, 10, 1400, 20], [200, 40, 1500, 50]])
        # A reading that is not cut by its strip is not dropped for a neighbour that is.
        kept, dropped = _drop_strip_duplicates([[line("a", "1,234", [1000, 10, 1250, 20])],
                                                [line("b", "4,567", [1180, 10, 1400, 20])]], spans)
        self.assertEqual(dropped, [])

    def test_the_ink_of_a_dropped_seam_line_is_one_area_when_the_line_is_in_one_cell(self):
        import numpy as np
        from ingestion.lib import pdf_rules, scan_ocr
        Rule, PageRules = pdf_rules.Rule, pdf_rules.PageRules

        def ink(x0, x1):
            dark = np.zeros((60, 1500), bool)
            for x in range(x0, x1, 6):  # strokes of one printed line, not a rule
                dark[10:18, x:x + 2] = True
            return dark

        def areas(dark, vertical):
            rules = PageRules(1, 1500.0, 60.0, tuple(vertical), ())
            return scan_ocr.ink_areas(scan_ocr.missed_ink(dark, 1.0, []), rules)

        dark = ink(1000, 1400)  # the line crosses the seam (x 1180..1300)
        # One cell (rules at 900 and 1450 over the line's height): the whole line is one area, inside the cell.
        one = areas(dark, [Rule(900.0, 0.0, 60.0), Rule(1450.0, 0.0, 60.0)])
        self.assertEqual(len(one), 1)
        self.assertTrue(one[0][0] <= 1000 and one[0][2] >= 1400 and one[0][0] > 900 and one[0][2] < 1450)
        # A merged heading: the column rules stop below it, so nothing divides it and it is one area too.
        merged = areas(dark, [Rule(1238.0, 30.0, 60.0)])
        self.assertEqual(len(merged), 1)
        # Inside the cell, a gap under 14 points between the parts keeps one area; 14 points splits it.
        def gap_areas(gap):  # the last stroke of the first part ends at x=1200, the next part starts `gap` later
            parts = np.zeros((60, 1500), bool)
            for x in list(range(1000, 1200, 6)) + list(range(1200 + gap, 1400 + gap, 6)):
                parts[10:18, x:x + 2] = True
            return areas(parts, [Rule(900.0, 0.0, 60.0), Rule(1450.0, 0.0, 60.0)])
        self.assertEqual(len(gap_areas(13)), 1)
        self.assertEqual(len(gap_areas(14)), 2)
        # Two cells (a rule through the line between its parts): two areas, never one line.
        two = areas(dark, [Rule(1238.0, 0.0, 60.0)])
        self.assertEqual(len(two), 2)
        self.assertTrue(two[0][2] < 1238 < two[1][0])

    def test_a_cut_reading_inside_a_longer_one_goes_but_conflicting_readings_stay(self):
        def line(id, text, box):
            return {"id": id, "parent_id": None, "kind": "region", "raw_text": text, "bbox_px": box}
        kept, dropped = _drop_strip_duplicates(
            [[line("a", "1,234,567", [60, 10, 140, 20]), line("x", "9,876", [100, 40, 140, 50])],
             [line("b", "4,567", [100, 10, 140, 20]), line("y", "9,877", [100, 40, 140, 50])]],
            [(0, 140), (80, 220)])
        self.assertEqual(dropped, ["b"])
        self.assertEqual(sorted(o["id"] for o in kept), ["a", "x", "y"])

    def test_strips_cover_the_width_and_one_strip_is_the_whole_region(self):
        self.assertEqual(_strips(1000, 1, 60), [(0, 1000)])
        strips = _strips(1000, 4, 60)
        self.assertEqual((strips[0][0], strips[-1][1]), (0, 1000))
        self.assertTrue(all(a[1] > b[0] for a, b in zip(strips, strips[1:])))

    def test_each_runtime_checks_its_own_declared_files(self):
        with tempfile.TemporaryDirectory() as directory:
            for runtime in ("onnxruntime", "paddle"):
                with self.subTest(runtime=runtime), self.assertRaisesRegex(PaddleOcrError, "no models are downloaded"):
                    _checked_models(["PP-OCRv6_small_det"], [Path(directory)], runtime)
        with self.assertRaisesRegex(PaddleOcrError, "not declared"):
            _checked_models(["PP-OCRv6_medium_det"], [Path(".")], "onnxruntime")

    def test_invalid_physical_pages_before_input_is_read(self):
        with PaddleOcr() as ocr:
            for pages in ([], [0], [True], [1, 1]):
                with self.subTest(pages=pages), self.assertRaisesRegex(ValueError, "distinct positive physical"):
                    ocr.recognize_pdf(Path("does-not-exist.pdf"), pages=pages)

    def test_invalid_retry_page_or_owner_before_pdf_render(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "unreadable.pdf"
            path.write_bytes(b"No valid PDF is needed to reject invalid declarations")
            with PaddleOcr() as ocr:
                with self.assertRaisesRegex(ValueError, "retry_regions must be keyed"):
                    ocr.recognize_pdf(path, pages=[1], retry_regions=[])
                with self.assertRaisesRegex(ValueError, "Retry pages must be requested"):
                    ocr.recognize_pdf(path, pages=[1], retry_regions={2: [OcrRegion("cell", (0, 0, 1, 1))]})
                with self.assertRaisesRegex(ValueError, "exactly one declared normal region"):
                    ocr.recognize_pdf(path, pages=[1], regions=[OcrRegion("left", (0, 0, 0.5, 1))],
                                      retry_regions={1: [OcrRegion("right-cell", (0.6, 0.1, 0.8, 0.2))]})

    def test_image_missing_models_fails_without_download(self):
        try:
            from PIL import Image
        except ImportError:
            self.skipTest("Optional Pillow is not installed")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "one-pixel.png"
            Image.new("RGB", (1, 1), "white").save(path)
            config = PaddleConfig(detection_model_dir=directory, recognition_model_dir=directory)
            with PaddleOcr(config) as ocr:
                with self.assertRaisesRegex(PaddleOcrError, "no models are downloaded"):
                    ocr.recognize_image(path)
            self.assertEqual([p.name for p in Path(directory).iterdir()], ["one-pixel.png"])


if __name__ == "__main__":
    unittest.main()
