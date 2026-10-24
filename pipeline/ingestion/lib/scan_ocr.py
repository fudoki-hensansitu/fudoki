"""Scan OCR entry point: PaddleOCR (PP-OCRv6 small on ONNX Runtime), ADR 0032."""
from __future__ import annotations

from collections import deque
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import re
import struct
import tempfile
import zlib
from functools import lru_cache
from difflib import SequenceMatcher
from pathlib import Path
from typing import Mapping, Sequence

import numpy as np

from . import paddle_ocr, pdf_rules, vlm_ocr
from .pdf_rules import PageRules
from .paddle_ocr import OcrRegion, PaddleConfig, PaddleOcr


def recognize_pdf(path: Path, *, pages: Sequence[int], config: PaddleConfig | None = None,
                  regions: Sequence[OcrRegion] | None = None,
                  retry_regions: Mapping[int, Sequence[OcrRegion]] | None = None) -> dict:
    """Read explicit physical pages. Retries are ordered, caller-declared crops of the original page."""
    return paddle_ocr.recognize_pdf(path, pages=pages, config=config or PaddleConfig(),
                                    regions=regions, retry_regions=retry_regions)


# Run-dependent fields go to the run record so the observation SHA tracks content only.
RUN_FIELDS = frozenset({"inference_seconds"})


def _content(value):
    if isinstance(value, dict):
        return {k: _content(v) for k, v in value.items() if k not in RUN_FIELDS}
    if isinstance(value, list):
        return [_content(v) for v in value]
    return value


def _timings(pages: list[dict]) -> list[dict]:
    rows = [{"page_number": page["page_number"], "region": region["id"],
             **{k: region[k] for k in RUN_FIELDS if k in region}}
            for page in pages for region in page["regions"]]
    return rows + [{"page_number": page["page_number"], "region": attempt["region_id"], "attempt": attempt["id"],
                    **{k: attempt[k] for k in RUN_FIELDS if k in attempt}}
                   for page in pages for attempt in page.get("attempts", ())]


def _slim(page: dict) -> dict:
    """A Paddle page without its native output: each attempt's observations are already in ``regions``."""
    page["attempts"] = [{k: v for k, v in attempt.items() if k not in ("native", "observations")}
                        for attempt in page.get("attempts", ())]
    return page


RULE_RUN_PT = 14.0   # a straight dark run this long is a rule or an underline, not a glyph
BOX_PAD_PT = 1.5     # ink this close to an OCR box belongs to it
JOIN_PX = 4          # pixels this close are one mark
MIN_PIXELS = 9       # smaller marks are specks; a thin 1 or a lone 0 is 9-11 px at 144 dpi, a bracket's tip 4-8
AREA_PAD_PT = 6.0    # OCR drops the leading 1 of an amount cut 3pt from it (measured: 21 → 39 of 45)


def _strip_runs(dark: np.ndarray, minimum: int) -> np.ndarray:
    out = dark.copy()
    for array, transposed in ((dark, False), (dark.T, True)):
        padded = np.zeros((array.shape[0], array.shape[1] + 2), np.int8)
        padded[:, 1:-1] = array
        edges = np.diff(padded, axis=1)
        for row in range(array.shape[0]):
            for start, end in zip(np.flatnonzero(edges[row] == 1), np.flatnonzero(edges[row] == -1)):
                if end - start >= minimum:
                    if transposed:
                        out[start:end, row] = False
                    else:
                        out[row, start:end] = False
    return out


def missed_ink(dark: np.ndarray, scale: float, boxes: Sequence[Sequence[float]]) -> list[tuple[float, ...]]:
    """Marks on the page that no OCR box covers and that are not rules, in displayed-page points.

    ``dark`` is a thresholded render, ``scale`` points per pixel. OCR drops a lone 0, a
    bare 一, single kanji of letter-spaced names and sometimes whole lines; all leave ink here.
    """
    ink = _strip_runs(dark, int(RULE_RUN_PT / scale))
    for x0, y0, x1, y1 in boxes:
        ink[max(0, int((y0 - BOX_PAD_PT) / scale)):int((y1 + BOX_PAD_PT) / scale) + 1,
            max(0, int((x0 - BOX_PAD_PT) / scale)):int((x1 + BOX_PAD_PT) / scale) + 1] = False
    pixels = set(zip(*(axis.tolist() for axis in np.nonzero(ink))))
    seen, marks = set(), []
    for seed in sorted(pixels):
        if seed in seen:
            continue
        queue, group = deque([seed]), []
        seen.add(seed)
        while queue:
            y, x = queue.popleft()
            group.append((y, x))
            for dy in range(-JOIN_PX, JOIN_PX + 1):
                for dx in range(-JOIN_PX, JOIN_PX + 1):
                    near = (y + dy, x + dx)
                    if near in pixels and near not in seen:
                        seen.add(near)
                        queue.append(near)
        if len(group) >= MIN_PIXELS:
            ys, xs = [g[0] for g in group], [g[1] for g in group]
            marks.append((min(xs) * scale, min(ys) * scale, (max(xs) + 1) * scale, (max(ys) + 1) * scale))
    return sorted(marks, key=lambda m: (m[1], m[0]))


DASH_PT = (2.0, 7.0, 2.0)  # a dash: at least / at most this wide, at most this tall (pt)


def _without_dashes(marks: Sequence[Sequence[float]], page: dict) -> list[tuple[float, ...]]:
    """The marks that are not a dash set in an amount column: a short thin stroke that ends where an amount, a
    unit mark or another dash of the page ends (they are set flush right). A dash there says the cell has no amount."""
    amounts = [o["bbox_pdf_pt"] for region in page["regions"] for o in region["observations"]
               if o["kind"] == "region" and o.get("bbox_pdf_pt")
               and ("".join(o["raw_text"].split()) == "円" or UNIT_BELOW.fullmatch("".join(o["raw_text"].split())))]
    low, high, tall = DASH_PT
    return [m for m in marks if not (low <= m[2] - m[0] <= high and m[3] - m[1] <= tall
                                     and any(abs(a[2] - m[2]) <= 4.0 for a in amounts))]


def ink_areas(marks: Sequence[Sequence[float]], rules: PageRules,
              boxes: Sequence[Sequence[float]] = ()) -> list[tuple[float, float, float, float]]:
    """Marks on one text line and in one cell become one tight area: OCR drops a lone 0 in a
    wide one. A reading of ``boxes`` that touches the marks on their line joins the area, so a
    number OCR read only in part (its last digit) is read whole."""
    groups: list[list[float]] = []
    for mark in sorted(marks, key=lambda m: (round((m[1] + m[3]) / 8), m[0])):
        middle = (mark[1] + mark[3]) / 2
        last = groups[-1] if groups else None
        if last and abs(middle - (last[1] + last[3]) / 2) < 4 and mark[0] - last[2] < 14 and not any(
                last[2] < r.position < mark[0] and r.covers(middle) for r in rules.vertical):
            groups[-1] = [min(last[0], mark[0]), min(last[1], mark[1]), max(last[2], mark[2]), max(last[3], mark[3])]
        else:
            groups.append(list(mark))
    areas = []
    for x0, y0, x1, y1 in groups:
        middle, half = (y0 + y1) / 2, max(y1 - y0, 10.0) / 2 + 2
        left, right = _cell(x0, x1, middle, rules)
        for box in sorted(boxes, key=lambda b: b[0]):
            if box[1] <= middle <= box[3] and left <= (box[0] + box[2]) / 2 <= right and (
                    -6 <= box[0] - x1 <= 6 or -6 <= x0 - box[2] <= 6):
                x0, x1 = min(x0, box[0]), max(x1, box[2])
        areas.append((max(left, x0 - AREA_PAD_PT), max(0.0, middle - half), min(right, x1 + AREA_PAD_PT),
                      min(rules.height, middle + half)))
    return areas


def _png(image: np.ndarray, path: Path) -> None:
    """An 8-bit grayscale PNG, written directly so no imaging library is needed."""
    height, width = image.shape
    raw = b"".join(b"\x00" + image[row].tobytes() for row in range(height))
    chunk = lambda kind, data: (struct.pack(">I", len(data)) + kind + data
                                + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF))
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))


def _paddle(config: PaddleConfig) -> PaddleOcr:
    """The engine shared with the page reads: one per configuration, never one per page."""
    return paddle_ocr.shared_engine(config)


def _renumber(page: dict, number: int) -> None:
    """Paddle read an image of one page: its ids say ``p1``. Name the page they belong to."""
    swap = lambda value: f"p{number}:{value[3:]}" if isinstance(value, str) and value.startswith("p1:") else value
    for region in page["regions"]:
        region.pop("attempt_ids", None)
        for o in region["observations"]:
            o.update(id=swap(o["id"]), parent_id=swap(o.get("parent_id")), attempt_id=swap(o.get("attempt_id")),
                     page_number=number)
    page.pop("attempts", None)


def _read_without_rules(path: Path, number: int, config: PaddleConfig, regions: Sequence[OcrRegion],
                        width_pt: float) -> dict:
    """The engine on the page with its rules whitened: next to a scanned rule OCR reads the rule's
    edge as 1, l or 一 however far the area keeps off the rule's nominal position. Paddle reads each
    area as a tight crop of the whitened page (no white padding, upscaled to 64 px)."""
    clean = _whitened(path, number, config.dpi)
    with tempfile.TemporaryDirectory() as tmp:
        png = Path(tmp) / "page.png"
        _png(clean, png)
        page = _paddle(config).recognize_image(png, regions=regions, small_regions=True)["pages"][0]
        _renumber(page, number)
    scale = width_pt / clean.shape[1]
    for region in page["regions"]:
        for o in region["observations"]:
            if o.get("bbox_px"):
                o["bbox_pdf_pt"] = [v * scale for v in o["bbox_px"]]
    page["page_number"] = number
    return page


@lru_cache(maxsize=2)
def _whitened(path: Path, number: int, dpi: int) -> np.ndarray:
    """The page rendered at ``dpi`` with its rules and their faint edges whitened."""
    image = pdf_rules.render(path, number, dpi)
    dark = image < pdf_rules.DARK
    clean = image.copy()
    rule = dark & ~_strip_runs(dark, int(RULE_RUN_PT * dpi / 72))
    edge = rule.copy()  # the faint edge left beside a whitened rule reads as ）
    for shift in (1, 2):
        edge[shift:] |= rule[:-shift]
        edge[:-shift] |= rule[shift:]
        edge[:, shift:] |= rule[:, :-shift]
        edge[:, :-shift] |= rule[:, shift:]
    clean[edge] = 255
    clean.setflags(write=False)
    return clean


def _cell(x0: float, x1: float, middle: float, rules: PageRules) -> tuple[float, float]:
    """The inside of the cell around ``x0``..``x1`` at height ``middle``, off its rules' edges."""
    margin = lambda rule: rule.thickness / 2 + 1.5
    left = max([r.position + margin(r) for r in rules.vertical if r.position <= x0 and r.covers(middle)], default=0.0)
    right = min([r.position - margin(r) for r in rules.vertical if r.position >= x1 and r.covers(middle)],
                default=rules.width)
    return left, right


def _covers_mark(box: Sequence[float], marks: Sequence[Sequence[float]]) -> bool:
    """A re-read counts only where it lies over missed ink, not over a sliver of a line already read."""
    return any(max(0.0, min(box[2], m[2]) - max(box[0], m[0])) * max(0.0, min(box[3], m[3]) - max(box[1], m[1]))
               >= 0.5 * (m[2] - m[0]) * (m[3] - m[1]) for m in marks)


def _overlaps(box: Sequence[float], other: Sequence[float]) -> bool:
    width = max(0.0, min(box[2], other[2]) - max(box[0], other[0]))
    height = max(0.0, min(box[3], other[3]) - max(box[1], other[1]))
    return width * height > 0.3 * max((box[2] - box[0]) * (box[3] - box[1]), 1e-9)


def superseded(page: dict) -> set[str]:
    """Observations a fuller re-read replaced (and their words): readers skip them."""
    ids = {i for region in page["regions"] for i in region.get("supersedes", ())}
    return ids | {o["id"] for region in page["regions"] for o in region["observations"] if o.get("parent_id") in ids}


def _boxes(page: dict) -> list[list[float]]:
    gone = superseded(page)
    return [o["bbox_pdf_pt"] for region in page["regions"] for o in region["observations"]
            if o.get("bbox_pdf_pt") and o["id"] not in gone]


def _inside(box: Sequence[float], outer: Sequence[float]) -> bool:
    width = max(0.0, min(box[2], outer[2]) - max(box[0], outer[0]))
    height = max(0.0, min(box[3], outer[3]) - max(box[1], outer[1]))
    return width * height >= 0.8 * max((box[2] - box[0]) * (box[3] - box[1]), 1e-9)


def _key(page: int, box: Sequence[float]) -> str:
    return f"{page}:" + ",".join(f"{v:.1f}" for v in box)


def require_one_page_box(path: Path, number: int) -> None:
    """Paddle's boxes are in the CropBox (pypdfium2) while the rules and the re-read crops come from
    poppler's MediaBox page. Where the two differ (a cropped A3 spread) the crops would read other ink than
    the boxes name, so the acquisition stops instead of reading it. Both render a rotated page as it is
    displayed (same size, same place for the ink: 281000's /Rotate 90 pages), so rotation alone is no reason."""
    import pypdfium2 as pdfium
    document = pdfium.PdfDocument(str(path))
    try:
        page = document[number - 1]
        crop, media, rotation = page.get_cropbox(), page.get_mediabox(), page.get_rotation()
    finally:
        document.close()
    if any(abs(a - b) > 0.01 for a, b in zip(crop, media)):
        raise ValueError(f"Page {number} has a CropBox {crop} different from its MediaBox {media} (rotation {rotation}); "
                         "the re-read of missed ink needs one box")


UNIT_STACK = re.compile(r"円\s*([△▲]?[0-9][0-9,，.]*)")


def split_unit_stacks(path: Path, page: dict, config: PaddleConfig) -> None:
    """A cell prints 円 small above its amount; Paddle's detector can box both lines as one tall
    box and read it as one line (`円0`, a lone 0 under 円). Split such a box at the bottom of the 円
    (its word box) and read the lower part alone with the recognition model. The upper part stays
    as the unit mark `円`. The merged reading is superseded, its words with it (region ``unit-<n>``).
    The amount counts only when it is a well-formed amount; otherwise the merged reading stays.
    """
    number = page["page_number"]
    found = []
    for region in page["regions"]:
        children = {}
        for o in region["observations"]:
            if o["kind"] == "word" and o.get("parent_id"):
                children.setdefault(o["parent_id"], []).append(o)
        for o in region["observations"]:
            box = o.get("bbox_pdf_pt")
            if o["kind"] != "region" or not box or not UNIT_STACK.fullmatch(o["raw_text"].strip()):
                continue
            unit = next((w for w in children.get(o["id"], ()) if w["raw_text"] == "円" and w.get("bbox_pdf_pt")), None)
            if unit and box[3] - unit["bbox_pdf_pt"][3] >= 3.0:
                found.append((o, unit["bbox_pdf_pt"][3]))
    if not found:
        return
    clean = _whitened(path, number, config.dpi)
    scale = config.dpi / 72
    with tempfile.TemporaryDirectory() as tmp:
        files = []
        for index, (o, cut) in enumerate(found):
            x0, _, x1, y1 = o["bbox_pdf_pt"]
            crop = clean[max(0, int((cut - 0.5) * scale)):int((y1 + 1) * scale), max(0, int((x0 - 1) * scale)):int((x1 + 1) * scale)]
            files.append(Path(tmp) / f"{index}.png")
            _png(np.ascontiguousarray(crop), files[-1])
        texts = paddle_ocr.recognize_crops(files, config)
    for index, ((o, cut), text) in enumerate(zip(found, texts)):
        text = "".join(text.split())
        if not AMOUNT.fullmatch(text):
            continue
        x0, y0, x1, y1 = o["bbox_pdf_pt"]
        page["regions"].append({"id": f"unit-{index}", "engine": "PP-OCRv6_small_rec", "supersedes": [o["id"]], "observations": [
            {"id": f"p{number}:unit-{index}:r0", "kind": "region", "parent_id": None, "raw_text": text,
             "bbox_pdf_pt": [round(v, 1) for v in (x0, cut, x1, y1)], "bbox_status": "available"},
            {"id": f"p{number}:unit-{index}:r1", "kind": "region", "parent_id": None, "raw_text": "円",
             "bbox_pdf_pt": [round(v, 1) for v in (x0, y0, x1, cut)], "bbox_status": "available"}]})


UNIT_MARK_PT = 7.5  # the 円 printed over an amount is at most this wide and tall
DASH_MARKS = ("一", "-", "－", "ー", "—", "―")
UNIT_BELOW = re.compile(r"[△▲]?[0-9][0-9,，.]*|[-－ー一]")


def reread_unit_marks(path: Path, page: dict, config: PaddleConfig) -> None:
    """The small 円 printed at the top right of a cell, over its amount, read in the page as something
    else (`川` `间` `1` `I`, Paddle at 5pt). A one-glyph reading no larger than a unit mark, with an amount
    right below it that ends at the same edge, is read again on its own crop by the recogniser alone, as
    ``_read_zeros`` does. Only a 円 replaces the reading (region ``unit-mark-<n>``, superseding it): a
    digit or a kanji that reading gives is left as it is. A lone 1 that reads as a dash on its own crop is that
    dash."""
    number = page["page_number"]
    observations = [o for region in page["regions"] for o in region["observations"]
                    if o["kind"] == "region" and o.get("bbox_pdf_pt") and o["id"] not in superseded(page)]
    amounts = [o["bbox_pdf_pt"] for o in observations if UNIT_BELOW.fullmatch("".join(o["raw_text"].split()))]
    found, stacks = [], []
    for o in observations:
        x0, y0, x1, y1 = o["bbox_pdf_pt"]
        text = "".join(o["raw_text"].split())
        if (len(text) == 1 and text != "円" and x1 - x0 <= UNIT_MARK_PT and y1 - y0 <= UNIT_MARK_PT
                and (any(-1.0 <= a[1] - y1 <= 6.0 and abs(a[2] - x1) <= 3.0 for a in amounts) or text == "1")):
            # (a lone 1 is also read again: a dash set small in an amount cell comes out as 1)
            found.append(o)
        elif (len(text) == 2 and UNIT_BELOW.fullmatch(text[1:]) and not text[0].isdigit() and x1 - x0 <= UNIT_MARK_PT + 1
                and 1.6 * (x1 - x0) <= y1 - y0 <= 2 * UNIT_MARK_PT + 1):
            # the unit over a one-glyph amount or a dash, boxed as one tall box and read as two glyphs
            stacks.append(o)
    if not found and not stacks:
        return
    clean = _whitened(path, number, config.dpi)
    scale = config.dpi / 72
    crops = [o["bbox_pdf_pt"] for o in found]
    for o in stacks:
        x0, y0, x1, y1 = o["bbox_pdf_pt"]
        crops += [[x0, y0, x1, (y0 + y1) / 2], [x0, (y0 + y1) / 2, x1, y1]]
    with tempfile.TemporaryDirectory() as tmp:
        files = []
        for index, (x0, y0, x1, y1) in enumerate(crops):
            crop = clean[max(0, int((y0 - 0.6) * scale)):int((y1 + 0.6) * scale), max(0, int((x0 - 0.6) * scale)):int((x1 + 0.6) * scale)]
            files.append(Path(tmp) / f"{index}.png")
            _png(np.ascontiguousarray(crop), files[-1])
        texts = ["".join(t.split()) for t in paddle_ocr.recognize_crops(files, config)]
    def region(index: int, o: dict, box: Sequence[float], text: str) -> dict:
        return {"id": f"unit-mark-{index}", "engine": "PP-OCRv6_small_rec", "supersedes": [o["id"]], "observations": [
            {"id": f"p{number}:unit-mark-{index}:r0", "kind": "region", "parent_id": None, "raw_text": text,
             "bbox_pdf_pt": [round(v, 1) for v in box], "bbox_status": "available"}]}
    for index, o in enumerate(found):
        if texts[index] == "円" or (texts[index] in DASH_MARKS and "".join(o["raw_text"].split()) == "1"):
            page["regions"].append(region(index, o, o["bbox_pdf_pt"], "円" if texts[index] == "円" else "一"))  # (a dash is read as 一)
    for k, o in enumerate(stacks):
        upper, lower = texts[len(found) + 2 * k], texts[len(found) + 2 * k + 1]
        if upper == "円" and UNIT_BELOW.fullmatch(lower):
            x0, y0, x1, y1 = o["bbox_pdf_pt"]
            middle = (y0 + y1) / 2
            first = region(len(found) + 2 * k, o, [x0, y0, x1, middle], "円")
            second = region(len(found) + 2 * k + 1, o, [x0, middle, x1, y1], lower)
            second["supersedes"] = []
            page["regions"] += [first, second]


MERGED_LINES = 1.7  # a name box this many times the page's usual line height holds more than one printed line
LINE_GAP_PX = 1  # blank pixel rows that part two lines of one box
LINE_VALLEY = .2  # a row with at most this share of the box's inked rows' count is blank


SPECK_PX = 6  # a component of at most this many pixels at 300dpi is dust, not a stroke


def _without_specks(crop: np.ndarray, level: int = 190) -> np.ndarray:
    """``crop`` (gray) with its tiny dark components (the tails of the glyphs of the next line, a rule's fringe) whitened."""
    dark = crop < level
    seen = np.zeros_like(dark)
    clean = crop.copy()
    height, width = dark.shape
    for y0, x0 in zip(*np.nonzero(dark)):
        if seen[y0, x0]:
            continue
        seen[y0, x0] = True
        queue, group = deque([(y0, x0)]), [(y0, x0)]
        while queue:
            y, x = queue.popleft()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < height and 0 <= nx < width and dark[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        queue.append((ny, nx))
                        group.append((ny, nx))
        if len(group) <= SPECK_PX:
            for y, x in group:
                clean[y, x] = 255
    return clean


def split_merged_lines(path: Path, page: dict, config: PaddleConfig) -> None:
    """A name set on two lines in a narrow cell, the lines almost touching, comes out of Paddle's detector as
    one tall box and is read as one jumbled line (`使用 料及科` for `使用料及` over `賃借料`). A name box much
    taller than the page's usual line, and at least three lines wide (a narrow box is characters stacked in a column,
    not lines), is cut at the blank pixel rows between its lines, each line is read
    alone by the recogniser, and the box is superseded (regions ``lines-<n>``). A box whose lines do not all
    read, or that has no blank row between its lines, is left as it is."""
    number = page["page_number"]
    gone = superseded(page)
    boxes = [(o, o["bbox_pdf_pt"]) for region in page["regions"] for o in region["observations"]
             if o["kind"] == "region" and o.get("bbox_pdf_pt") and o["id"] not in gone]
    plain = lambda o: "".join(o["raw_text"].split())
    heights = sorted(b[3] - b[1] for o, b in boxes if 3 <= len(plain(o)) <= 30 and not re.search(r"[0-9０-９,，.円]", plain(o)))
    if len(heights) < 5:
        return
    usual = heights[len(heights) // 2]
    tall = [(o, b) for o, b in boxes if b[3] - b[1] >= MERGED_LINES * usual and b[2] - b[0] >= 3 * usual
            and 2 <= len(plain(o)) <= 30 and not re.search(r"[0-9０-９,，.円]", plain(o))]
    if not tall:
        return
    clean = _whitened(path, number, config.dpi)
    scale = config.dpi / 72
    plans, tops = [], []
    for o, (x0, y0, x1, y1) in tall:
        top, bottom, left, right = (max(0, int(y0 * scale)), int(y1 * scale) + 1, max(0, int((x0 - 0.3) * scale)),
                                    int((x1 + 0.3) * scale) + 1)
        window = clean[top:bottom, left:right].copy()
        for other, (ox0, oy0, ox1, oy1) in boxes:
            if other is not o and ox0 < x1 and ox1 > x0 and oy0 < y1 and oy1 > y0:
                # what another reading covers (the cell's number set beside the name) is not this name's ink
                window[max(0, int(oy0 * scale) - top):max(0, int(oy1 * scale) + 1 - top),
                       max(0, int(ox0 * scale) - left):max(0, int(ox1 * scale) + 1 - left)] = 255
        ink = window < 190
        counts = ink.sum(axis=1)
        # a row is blank between lines when only the tails of the glyphs reach it
        rows = counts > LINE_VALLEY * np.percentile(counts, 90)
        cuts, start = [], None
        for index, row in enumerate(rows):
            if row and start is None:
                start = index
            if not row and start is not None:
                cuts.append((start, index))
                start = None
        if start is not None:
            cuts.append((start, len(rows)))
        # blank rows narrower than LINE_GAP_PX do not part lines; a line must be about a usual line high
        lines = []
        for first, last in cuts:
            if lines and first - lines[-1][1] < LINE_GAP_PX:
                lines[-1] = (lines[-1][0], last)
            else:
                lines.append((first, last))
        lines = [line for line in lines if line[1] - line[0] >= 0.4 * usual * scale]
        if len(lines) < 2 or any(line[1] - line[0] > 1.6 * usual * scale for line in lines):
            continue
        parts = []
        for first, last in lines:
            columns = np.flatnonzero(ink[first:last].any(axis=0))
            parts.append((top + first, top + last, left + int(columns[0]), left + int(columns[-1]) + 1))
        plans.append((o, parts, window))
        tops.append((top, left))
    if not plans:
        return
    with tempfile.TemporaryDirectory() as tmp:
        files = []
        for index, (o, parts, window) in enumerate(plans):
            for k, (a, b, c, d) in enumerate(parts):
                files.append(Path(tmp) / f"{index}-{k}.png")
                origin = tops[index]
                crop = window[max(0, a - origin[0] - 2):b - origin[0] + 2, max(0, c - origin[1] - 2):d - origin[1] + 2]
                _png(np.ascontiguousarray(_without_specks(crop)), files[-1])
        # (the edge of the number set beside the name can leave a dot before the first character: no name starts so)
        texts = ["".join(t.split()).lstrip("。、°.,・") for t in paddle_ocr.recognize_crops(files, config)]
    cursor = 0
    for index, (o, parts, _) in enumerate(plans):
        read = texts[cursor:cursor + len(parts)]
        cursor += len(parts)
        if not all(read):
            continue
        page["regions"].append({"id": f"lines-{index}", "engine": "PP-OCRv6_small_rec", "supersedes": [o["id"]], "observations": [
            {"id": f"p{number}:lines-{index}:r{k}", "kind": "region", "parent_id": None, "raw_text": text,
             "bbox_pdf_pt": [round(v, 1) for v in (c / scale, a / scale, d / scale, b / scale)], "bbox_status": "available"}
            for k, (text, (a, b, c, d)) in enumerate(zip(read, parts))]})


SEAM_COVER_PT = 2.0  # a re-read covers a dropped seam pair when it reaches its box within this


def settle_seams(page: dict) -> dict:
    """A seam pair Paddle dropped (one line read in two cut pieces, ``seam_dropped_boxes_px``) is given back
    whole by the re-read or not at all.

    The re-read must be one reading that covers the pair's whole box (its left and right ends within
    ``SEAM_COVER_PT``). If none does, a piece of it must not stand for the line (a name cut short passes
    every check): the pieces the re-read took inside that box are removed and the box is recorded in
    ``unread_ink``. Readings of the full-page pass are not touched."""
    boxes_px = [box for attempt in page.get("attempts", ()) for box in attempt.get("seam_dropped_boxes_px", ())]
    if not boxes_px:
        return page
    factor = page["displayed_pdf_size_pt"][0] / page["image_width"]
    unread = [list(area) for area in page.get("unread_ink", ())]
    seams = [list(area) for area in page.get("unread_seams", ())]
    for box in ([v * factor for v in b] for b in boxes_px):
        middle = (box[1] + box[3]) / 2
        found = [(region, o) for region in page["regions"] for o in region["observations"]
                 if o["kind"] == "region" and o.get("bbox_pdf_pt") and o["bbox_pdf_pt"][1] <= middle <= o["bbox_pdf_pt"][3]
                 and o["bbox_pdf_pt"][0] < box[2] and o["bbox_pdf_pt"][2] > box[0]]
        if any(o["bbox_pdf_pt"][0] <= box[0] + SEAM_COVER_PT and o["bbox_pdf_pt"][2] >= box[2] - SEAM_COVER_PT for _, o in found):
            continue
        taken = {o["id"] for region, o in found if region["id"].startswith(("ink-", "vlm-"))}
        for region in page["regions"]:
            region["observations"] = [o for o in region["observations"]
                                      if o["id"] not in taken and o.get("parent_id") not in taken]
        page["regions"] = [r for r in page["regions"] if r["observations"] or not r["id"].startswith(("ink-", "vlm-"))]
        area = [round(v, 1) for v in box]
        if area not in unread:
            unread.append(area)
        if area not in seams:
            seams.append(area)
    if unread:
        page["unread_ink"] = unread
    if seams:
        page["unread_seams"] = seams  # read by the converter, which stops on them in any column
    return page


def supplement(path: Path, page: dict, config: PaddleConfig, previous: Mapping[str, str], *,
               vlm_fallback: bool = True, ink_dark: int = pdf_rules.DARK, unit_marks: bool = False,
               merged_lines: bool = False) -> dict:
    """``_supplement``, then the seam pairs it left (``settle_seams``)."""
    return settle_seams(_supplement(path, page, config, previous, vlm_fallback=vlm_fallback, ink_dark=ink_dark,
                                    unit_marks=unit_marks, merged_lines=merged_lines))


def _supplement(path: Path, page: dict, config: PaddleConfig, previous: Mapping[str, str], *,
                vlm_fallback: bool = True, ink_dark: int = pdf_rules.DARK, unit_marks: bool = False,
                merged_lines: bool = False) -> dict:
    """Read the ink OCR missed on one page: the engine on those areas, then the VLM on what remains.

    The engine reads each tight area (``ink_areas``) as a new region ``ink-<n>``. A reading that
    lies over missed ink is kept and replaces the readings it contains (``supersedes``, e.g.
    the last digit OCR read alone); one that cuts through a reading it does not contain is dropped. For marks still uncovered, the VLM reads their whole line in
    the cell and the characters OCR lacked become regions ``vlm-<n>`` (``_fill``); what it
    cannot place is kept in ``unread_ink``. Answers are pinned by area, so re-acquiring
    reuses ``previous`` instead of asking again. ``ink_dark`` is the gray level below which a pixel counts
    as ink (a scan whose small print is pale declares a level above the default, or its lines never show as missed).
    """
    number = page["page_number"]
    require_one_page_box(path, number)
    split_unit_stacks(path, page, config)
    if unit_marks:
        reread_unit_marks(path, page, config)
    if merged_lines:
        split_merged_lines(path, page, config)
    rules = pdf_rules.detect(path, number)
    image = pdf_rules.render(path, number)
    dark, scale = image < ink_dark, rules.width / image.shape[1]
    # (a dash set in an amount column is no missed ink: only where the request lowers the ink level, which is what
    # makes a dash's pixels count; the default level never saw them)
    missed = (lambda: _without_dashes(missed_ink(dark, scale, _boxes(page)), page)) if ink_dark != pdf_rules.DARK \
        else (lambda: missed_ink(dark, scale, _boxes(page)))
    marks = missed()
    if not marks:
        return page
    areas = ink_areas(marks, rules, _boxes(page))
    regions = [OcrRegion(f"ink-{i}", (a[0] / rules.width, a[1] / rules.height, a[2] / rules.width, a[3] / rules.height))
               for i, a in enumerate(areas)]
    read = _read_without_rules(path, number, config, regions, rules.width)
    gone = superseded(page)
    existing = [(o["id"], o["bbox_pdf_pt"]) for region in page["regions"] for o in region["observations"]
                if o["kind"] == "region" and o.get("bbox_pdf_pt") and o["id"] not in gone]
    for region in read["regions"]:
        kept, replaced = set(), set()
        for o in region["observations"]:
            box = o.get("bbox_pdf_pt")
            if o["kind"] != "region" or not box or not _covers_mark(box, marks):
                continue
            inside = {key for key, other in existing if _inside(other, box)}
            if any(_overlaps(other, box) or _overlaps(box, other) for key, other in existing if key not in inside):
                continue  # it cuts through a reading it does not contain: not trusted
            o["raw_text"] = _balanced(o["raw_text"], _tokens(page, _line(box, rules)))
            if not _well_formed(o["raw_text"]):
                continue  # a number read in part ("，949,000"): left to the VLM's line reading
            kept.add(o["id"])
            replaced |= inside
        region["observations"] = [o for o in region["observations"] if o["id"] in kept or o.get("parent_id") in kept]
        if region["observations"]:
            if replaced:
                region["supersedes"] = sorted(replaced)
            page["regions"].append(region)
    _read_zeros(path, number, config, page, missed())
    rest = ink_areas(missed(), rules)
    if not vlm_fallback:
        if rest:
            page['unread_ink'] = [[round(v, 1) for v in area] for area in rest]
        return page
    keys = [_key(number, area) for area in rest]
    lines = {key: _line(area, rules) for area, key in zip(rest, keys)}
    asked = [key for key in keys if key not in previous]
    def ask(key: str) -> str | None:
        try:
            return vlm_ocr.read(path, number, lines[key], margin=2.0)
        except RuntimeError:
            return None  # the model did not answer; asked again on the next acquisition
    with ThreadPoolExecutor(4) as pool:
        answers = dict(zip(asked, pool.map(ask, asked)))
    unread, failed, added = [], [], []
    for index, (area, key) in enumerate(zip(rest, keys)):
        if key in previous:
            text = previous[key]
        elif answers[key] is None:
            failed.append([round(v, 1) for v in area])
            continue
        else:
            text = _fill(answers[key], _tokens(page, lines[key]), area) or vlm_ocr.UNREADABLE
        if text == vlm_ocr.UNREADABLE:
            unread.append([round(v, 1) for v in area])
            continue
        added.append({"id": f"vlm-{index}", "engine": vlm_ocr.MODEL, "observations": [
            {"id": f"p{number}:vlm-{index}:r0", "kind": "region", "parent_id": None, "raw_text": text,
             "bbox_pdf_pt": [round(v, 1) for v in area], "bbox_status": "available"}]})
    page["regions"].extend(added)
    if unread:
        page["unread_ink"] = unread
    if failed:
        page["vlm_failed"] = failed
    return page


NUMERIC = re.compile(r"[0-9,，.△▲()（）\s]+")
AMOUNT = re.compile(r"[（(]?\s*[△▲]?[0-9]{1,3}(?:[,，][0-9]{3})*\s*[)）]?")


def _well_formed(text: str) -> bool:
    """Text of digits and separators only must be one whole amount; other text passes."""
    return not NUMERIC.fullmatch(text) or AMOUNT.fullmatch(text.strip()) is not None


def _balanced(text: str, tokens: Sequence[tuple[str, Sequence[float]]]) -> str:
    """Drop a closing bracket no opening one on the line explains: the edge of a whitened rule
    beside a 0 reads as ）."""
    line = text + "".join(t for t, _ in tokens)
    if text.rstrip()[-1:] in ")）" and not any(c in line for c in "(（"):
        return text.rstrip()[:-1].rstrip()
    return text


def _zero_shaped(mark: Sequence[float]) -> bool:
    """One mark of a digit's size: almost always a lone 0 or a code's 1 OCR dropped (a 1 is
    1.0-1.5pt wide; a bracket as thin is read as a bracket and left to the VLM)."""
    return 1.0 <= mark[2] - mark[0] <= 6.5 and 3.5 <= mark[3] - mark[1] <= 9.0


def _read_zeros(path: Path, number: int, config: PaddleConfig, page: dict, marks: Sequence[Sequence[float]]) -> None:
    """Digit-sized marks still uncovered go to Paddle's recogniser alone: it read all 345 such
    marks of a trial as codex did, in about 130 ms each. A single digit becomes region ``digit-<n>``."""
    shaped = [m for m in marks if _zero_shaped(m)]
    if not shaped:
        return
    clean = _whitened(path, number, config.dpi)
    scale = config.dpi / 72
    with tempfile.TemporaryDirectory() as tmp:
        files = []
        for index, (x0, y0, x1, y1) in enumerate(shaped):
            crop = clean[max(0, int((y0 - 2) * scale)):int((y1 + 2) * scale),
                         max(0, int((x0 - 2) * scale)):int((x1 + 2) * scale)]
            files.append(Path(tmp) / f"{index}.png")
            _png(np.ascontiguousarray(crop), files[-1])
        texts = paddle_ocr.recognize_crops(files, config)
    for index, (mark, text) in enumerate(zip(shaped, texts)):
        text = "".join(text.split())
        if re.fullmatch(r"[0-9]", text):
            page["regions"].append({"id": f"digit-{index}", "engine": "PP-OCRv6_small_rec", "observations": [
                {"id": f"p{number}:digit-{index}:r0", "kind": "region", "parent_id": None, "raw_text": text,
                 "bbox_pdf_pt": [round(v, 1) for v in mark], "bbox_status": "available"}]})


def _line(area: Sequence[float], rules: PageRules) -> tuple[float, float, float, float]:
    """The text line of ``area`` across its cell: the VLM reads it with its context."""
    left, right = _cell(area[0], area[2], (area[1] + area[3]) / 2, rules)
    return (left, area[1], right, area[3])


def _tokens(page: dict, line: Sequence[float]) -> list[tuple[str, list[float]]]:
    """OCR lines whose centre lies in ``line``, left to right, as (text without spaces, box)."""
    found, gone = [], superseded(page)
    for region in page["regions"]:
        for o in region["observations"]:
            box = o.get("bbox_pdf_pt")
            if o["kind"] == "region" and o["id"] not in gone and box and line[0] <= (box[0] + box[2]) / 2 <= line[2] \
                    and line[1] <= (box[1] + box[3]) / 2 <= line[3]:
                found.append(("".join(o["raw_text"].split()), box))
    return sorted(found, key=lambda item: item[1][0])


def _fill(answer: str, tokens: Sequence[tuple[str, Sequence[float]]], area: Sequence[float]) -> str | None:
    """The characters the VLM read in ``area``: its reading of the whole line minus what OCR read.

    The two must differ by exactly one insertion, placed between the OCR characters left and
    right of ``area``; anything else is not trusted (a single crop alone confused 繕 with 繰).
    """
    reading = "".join(answer.split())
    if not reading or reading == vlm_ocr.UNREADABLE:
        return None
    observed = "".join(text for text, _ in tokens)
    if not observed:
        return "一" + reading[1:] if reading[:1] in DASHES and len(reading) > 1 else reading
    owners = [box for text, box in tokens for _ in text]
    changes = [op for op in SequenceMatcher(None, observed, reading, autojunk=False).get_opcodes() if op[0] != "equal"]
    if len(changes) != 1 or changes[0][0] != "insert":
        return None
    _, at, _, start, end = changes[0]
    centre = (area[0] + area[2]) / 2
    if at > 0 and (owners[at - 1][0] + owners[at - 1][2]) / 2 > centre:
        return None
    if at < len(owners) and (owners[at][0] + owners[at][2]) / 2 < centre:
        return None
    inserted = reading[start:end]
    # Models give the bare stroke of 一 as a dash or a long-vowel mark. A long-vowel mark follows
    # kana; at a word's start or after a kanji the stroke is the kanji 一.
    if inserted[:1] in DASHES and (at == 0 or not _kana(observed[at - 1])):
        inserted = "一" + inserted[1:]
    return inserted


DASHES = "ー―‐－—─"


def _kana(char: str) -> bool:
    return "\u3041" <= char <= "\u30fa"


def _vlm_identity() -> dict:
    # ``read`` names how an answer becomes text; changing it invalidates pinned answers.
    return {"model": vlm_ocr.MODEL, "prompt_sha256": hashlib.sha256(vlm_ocr.TEXT_PROMPT.encode()).hexdigest(),
            "read": "cell-line-minus-ocr-v7", "digits": "PP-OCRv6_small_rec"}


def _pinned_answers(observation: Mapping | None) -> dict[str, str]:
    """VLM answers of a pinned observation, only when the same model and prompt gave them."""
    answers = {}
    if not observation or observation.get("vlm") != _vlm_identity():
        return answers
    for page in observation.get("pages", []):
        for region in page["regions"]:
            if region["id"].startswith("vlm-"):
                item = region["observations"][0]
                answers[_key(page["page_number"], item["bbox_pdf_pt"])] = item["raw_text"]
        for area in page.get("unread_ink", []):
            answers[_key(page["page_number"], area)] = vlm_ocr.UNREADABLE
    return answers


def acquire(path: Path, request: Mapping, previous: Mapping | None = None) -> tuple[bytes, dict]:
    """Read one declared OCR request; return canonical observation bytes and a run record.

    The observation holds only what the request read and what OCR returned, so
    re-reading with the same engine and renderer yields identical bytes (ADR 0019).
    Elapsed time, local paths and the environment go to the run record. Ink that the engine
    missed is read again (``supplement``); VLM answers of ``previous`` are reused.
    """
    if request.get("engine") != "paddle":
        raise ValueError("OCR inputs are acquired with Paddle")
    config = PaddleConfig(**request.get("config", {}))
    path = Path(path)
    regions = [OcrRegion(r["id"], tuple(r["bbox_normalized"])) for r in request["regions"]] \
        if "regions" in request else None
    result = recognize_pdf(path, pages=request["pages"], config=config, regions=regions)
    empty = [page["page_number"] for page in result["pages"]
             if not any(region["observations"] for region in page["regions"])]
    if empty:
        raise ValueError(f"OCR returned no text for pages {empty}")
    result["pages"] = [_slim(page) for page in result["pages"]]
    pinned = _pinned_answers(previous)
    result["pages"] = [supplement(path, page, config, pinned, vlm_fallback=request.get('vlm_fallback', True),
                          ink_dark=request.get('ink_dark', pdf_rules.DARK), unit_marks=bool(request.get('unit_marks')),
                          merged_lines=bool(request.get('merged_lines')))
                       for page in result["pages"]]
    observation = {"schema_version": 1, "request": dict(request), "vlm": _vlm_identity(),
                   "origin": {k: result["origin"][k] for k in ("sha256", "bytes")},
                   "pages": _content(result["pages"])}
    # The renderer and the dpi decide the pixels the engine reads; defaults are recorded, not left implicit.
    observation["render"] = {"pdf_renderer": config.pdf_renderer, "dpi": config.dpi}
    data = json.dumps(observation, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False).encode()
    run = {"schema_version": 1, "observation_sha256": hashlib.sha256(data).hexdigest(),
           "origin_path": result["origin"]["path"], "engine": result["engine"], "renderer": result.get("renderer"),
           "timings": _timings(result["pages"])}
    return data, run


def recognize_image(path: Path, *, config: PaddleConfig | None = None,
                    regions: Sequence[OcrRegion] | None = None,
                    retry_regions: Sequence[OcrRegion] = ()) -> dict:
    """Read an upright image; coordinates refer to original image pixels."""
    return paddle_ocr.recognize_image(path, config=config or PaddleConfig(),
                                      regions=regions, retry_regions=retry_regions)
