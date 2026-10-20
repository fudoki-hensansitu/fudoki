"""Scan OCR entry point: PaddleOCR (PP-OCRv6 small on ONNX Runtime) by default, Apple Vision on request.

New acquisitions use Paddle (ADR 0032). Books acquired with Apple Vision keep ``engine: "vision"``,
because their pinned amount corrections are bound to Vision's observation ids. When ``backend``
is omitted, a passed config's type names the engine.
"""
from __future__ import annotations

from collections import deque
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import re
import struct
import tempfile
import zlib
from dataclasses import replace
from functools import lru_cache
from difflib import SequenceMatcher
from pathlib import Path
from typing import Mapping, Sequence

import numpy as np

from . import paddle_ocr, pdf_rules, vision_ocr, vlm_ocr
from .pdf_rules import PageRules
from .paddle_ocr import PaddleConfig, PaddleOcr
from .vision_ocr import OcrRegion, VisionConfig


def _backend(backend: str | None, config: PaddleConfig | VisionConfig | None) -> str:
    if backend is not None:
        return backend
    return "vision" if isinstance(config, VisionConfig) else "paddle"


def _config(backend: str, config: PaddleConfig | VisionConfig | None):
    if backend == "paddle":
        if config is None:
            return PaddleConfig()
        if isinstance(config, PaddleConfig):
            return config
        raise ValueError("paddle requires PaddleConfig")
    if backend == "vision":
        if config is None:
            return VisionConfig()
        if isinstance(config, VisionConfig):
            return config
        raise ValueError("vision requires VisionConfig")
    raise ValueError("backend must be vision or paddle; no engine is substituted")


def recognize_pdf(path: Path, *, pages: Sequence[int], backend: str | None = None,
                  config: PaddleConfig | VisionConfig | None = None,
                  regions: Sequence[OcrRegion] | None = None,
                  retry_regions: Mapping[int, Sequence[OcrRegion]] | None = None) -> dict:
    """Read explicit physical pages with the selected engine.

    Paddle is the default. Paddle retries are ordered, caller-declared
    crops of the original page; Vision retries are separate calls.
    """
    backend = _backend(backend, config)
    selected = _config(backend, config)
    if backend == "paddle":
        return paddle_ocr.recognize_pdf(path, pages=pages, config=selected,
                                       regions=regions, retry_regions=retry_regions)
    if retry_regions:
        raise ValueError("Vision retries use separate calls with regions")
    return vision_ocr.recognize_pdf(path, pages=pages, config=selected, regions=regions)


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


def column_tiles(rules: PageRules, ink, height: float = 150.0) -> list[OcrRegion]:
    """Non-overlapping regions of one page: the header band, then tiles of each table column.

    Vision drops lines of a long narrow image and misreads text at an image edge. Columns
    end at the rules that start with the table (stepped 科目 rules start lower and would cut
    names) and keep 1pt off them, since OCR reads an edge rule as 1 or l. A column is cut
    only in the middle of a run of rows without text (blank, or a rule across it): the
    last such run before ``height`` points, else the first one after; text is never cut.
    """
    tall = rules.vertical
    if not tall:
        return [OcrRegion("full-page", (0, 0, 1, 1))]
    top, bottom = min(r.start for r in tall), max(r.end for r in tall)
    columns = [r for r in tall if r.start <= top + 0.1 * (bottom - top)]
    started = max(r.start for r in columns)
    header = min((r.position for r in rules.horizontal
                  if r.position >= started and r.end - r.start >= 0.3 * rules.width), default=None)
    if header is None:
        return [OcrRegion("full-page", (0, 0, 1, 1))]
    scale = ink.shape[0] / rules.height
    xs = sorted({0.0, *(min(r.position, rules.width) for r in columns), rules.width})
    regions = [OcrRegion("header", (0, 0, 1, header / rules.height))]
    for index, (x0, x1) in enumerate(zip(xs, xs[1:])):
        inset = 1.0 if x1 - x0 > 10 else 0.0
        left, right = x0 + inset, x1 - inset
        if right - left < 1:
            continue
        upper = int(header * scale) + 1
        strip = ink[upper:, int(left * scale) + 1:max(int(left * scale) + 2, int(right * scale) - 1)]
        share = strip.mean(axis=1)
        text = (share > 0) & (share <= 0.6)  # a rule across the strip is not text
        gaps, run = [], None
        for row, is_text in enumerate(text):
            if not is_text and run is None:
                run = row
            elif is_text and run is not None:
                gaps.append((upper + (run + row) / 2) / scale)
                run = None
        cuts, start = [header], header
        while True:
            inside = [g for g in gaps if start + 1 < g <= start + height]
            after = [g for g in gaps if g > start + height]
            if not (inside or after):
                break
            start = max(inside) if inside else min(after)
            cuts.append(start)
        cuts.append(rules.height)
        for part, (y0, y1) in enumerate(zip(cuts, cuts[1:])):
            box = tuple(float(min(1.0, max(0.0, v))) for v in
                        (left / rules.width, y0 / rules.height, right / rules.width, y1 / rules.height))
            if box[0] < box[2] and box[1] < box[3]:
                regions.append(OcrRegion(f"tile-{index}-{part}", box))
    return regions


RULE_RUN_PT = 14.0   # a straight dark run this long is a rule or an underline, not a glyph
BOX_PAD_PT = 1.5     # ink this close to an OCR box belongs to it
JOIN_PX = 4          # pixels this close are one mark
MIN_PIXELS = 9       # smaller marks are specks; a thin 1 or a lone 0 is 9-11 px at 144 dpi, a bracket's tip 4-8
AREA_PAD_PT = 6.0    # Vision drops the leading 1 of an amount cut 3pt from it (measured: 21 → 39 of 45)


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

    ``dark`` is a thresholded render, ``scale`` points per pixel. Vision drops a lone 0, a
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


def ink_areas(marks: Sequence[Sequence[float]], rules: PageRules,
              boxes: Sequence[Sequence[float]] = ()) -> list[tuple[float, float, float, float]]:
    """Marks on one text line and in one cell become one tight area: Vision drops a lone 0 in a
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


@lru_cache(maxsize=1)
def _paddle(config: PaddleConfig) -> PaddleOcr:
    """One engine for the page-by-page re-reads of an acquisition."""
    return PaddleOcr(config)


def _renumber(page: dict, number: int) -> None:
    """Paddle read an image of one page: its ids say ``p1``. Name the page they belong to."""
    swap = lambda value: f"p{number}:{value[3:]}" if isinstance(value, str) and value.startswith("p1:") else value
    for region in page["regions"]:
        region.pop("attempt_ids", None)
        for o in region["observations"]:
            o.update(id=swap(o["id"]), parent_id=swap(o.get("parent_id")), attempt_id=swap(o.get("attempt_id")),
                     page_number=number)
    page.pop("attempts", None)


def _read_without_rules(path: Path, number: int, config: VisionConfig | PaddleConfig, regions: Sequence[OcrRegion],
                        width_pt: float) -> dict:
    """The engine on the page with its rules whitened: next to a scanned rule Vision reads the rule's
    edge as 1, l or 一 however far the area keeps off the rule's nominal position. Paddle reads each
    area as a tight crop of the whitened page (no white padding, upscaled to 64 px)."""
    clean = _whitened(path, number, config.dpi)
    with tempfile.TemporaryDirectory() as tmp:
        png = Path(tmp) / "page.png"
        _png(clean, png)
        if isinstance(config, PaddleConfig):
            page = _paddle(config).recognize_image(png, regions=regions, small_regions=True)["pages"][0]
            _renumber(page, number)
        else:
            page = vision_ocr.recognize_image(png, config=replace(config, region_padding_px=60), regions=regions)["pages"][0]
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


def supplement(path: Path, page: dict, config: VisionConfig | PaddleConfig, previous: Mapping[str, str], *,
               vlm_fallback: bool = True) -> dict:
    """Read the ink OCR missed on one page: the engine on those areas, then the VLM on what remains.

    The engine (Vision or Paddle, by ``config``) reads each tight area (``ink_areas``) as a new region ``ink-<n>``. A reading that
    lies over missed ink is kept and replaces the readings it contains (``supersedes``, e.g.
    the last digit OCR read alone); one that cuts through a reading it does not contain is dropped. For marks still uncovered, the VLM reads their whole line in
    the cell and the characters OCR lacked become regions ``vlm-<n>`` (``_fill``); what it
    cannot place is kept in ``unread_ink``. Answers are pinned by area, so re-acquiring
    reuses ``previous`` instead of asking again.
    """
    number = page["page_number"]
    rules = pdf_rules.detect(path, number)
    image = pdf_rules.render(path, number)
    dark, scale = image < pdf_rules.DARK, rules.width / image.shape[1]
    marks = missed_ink(dark, scale, _boxes(page))
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
    _read_zeros(path, number, config, page, missed_ink(dark, scale, _boxes(page)))
    rest = ink_areas(missed_ink(dark, scale, _boxes(page)), rules)
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
    """One mark of a digit's size: almost always a lone 0 or a code's 1 Vision dropped (a 1 is
    1.0-1.5pt wide; a bracket as thin is read as a bracket and left to the VLM)."""
    return 1.0 <= mark[2] - mark[0] <= 6.5 and 3.5 <= mark[3] - mark[1] <= 9.0


def _read_zeros(path: Path, number: int, config: VisionConfig | PaddleConfig, page: dict, marks: Sequence[Sequence[float]]) -> None:
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
        texts = paddle_ocr.recognize_crops(files, config if isinstance(config, PaddleConfig) else PaddleConfig())
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
    engine = request.get("engine")
    if engine not in ("vision", "paddle"):
        raise ValueError("OCR inputs are acquired with Paddle or Apple Vision")
    paddle = engine == "paddle"
    config = PaddleConfig(**request.get("config", {})) if paddle else VisionConfig(**request.get("config", {}))
    # Vision drops text at an image edge; its tiles and re-reads get white padding. Paddle reads exact crops.
    padded = config if paddle else replace(config, region_padding_px=60)
    path = Path(path)
    regions = [OcrRegion(r["id"], tuple(r["bbox_normalized"])) for r in request["regions"]] \
        if "regions" in request else None
    if request.get('column_tiles'):
        if paddle:
            raise ValueError('Column tiles are for Vision; Paddle splits a page with config.page_strips')
        if regions:
            raise ValueError('Column tiles and explicit regions are alternative OCR requests')
        result = None
        dark = request.get('rule_dark', pdf_rules.DARK)  # a scan whose rules are printed pale declares a higher level
        for number in request['pages']:
            rules = pdf_rules.detect(path, number, dark=dark)
            tiles = column_tiles(rules, pdf_rules.render(path, number) < dark)
            reading = recognize_pdf(path, pages=[number], backend=engine, config=padded, regions=tiles)
            if result is None:
                result = reading
            else:
                result['pages'].extend(reading['pages'])
    else:
        result = recognize_pdf(path, pages=request["pages"], backend=engine, config=config, regions=regions)
    # Vision can return nothing for a whole dense page without an error. Such a page is
    # read again in column tiles bounded by its rules; still empty, it stops here. Paddle has no such fallback.
    for index, page in enumerate(result["pages"]):
        if not paddle and not any(region["observations"] for region in page["regions"]):
            dark = request.get('rule_dark', pdf_rules.DARK)
            tiles = column_tiles(pdf_rules.detect(path, page["page_number"], dark=dark),
                                 pdf_rules.render(path, page["page_number"]) < dark)
            result["pages"][index] = recognize_pdf(path, pages=[page["page_number"]], backend=engine,
                                                   config=padded, regions=tiles)["pages"][0]
    empty = [page["page_number"] for page in result["pages"]
             if not any(region["observations"] for region in page["regions"])]
    if empty:
        raise ValueError(f"OCR returned no text for pages {empty}")
    if paddle:
        result["pages"] = [_slim(page) for page in result["pages"]]
    pinned = _pinned_answers(previous)
    result["pages"] = [supplement(path, page, config, pinned, vlm_fallback=request.get('vlm_fallback', True))
                       for page in result["pages"]]
    observation = {"schema_version": 1, "request": dict(request), "vlm": _vlm_identity(),
                   "origin": {k: result["origin"][k] for k in ("sha256", "bytes")},
                   "pages": _content(result["pages"])}
    data = json.dumps(observation, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False).encode()
    run = {"schema_version": 1, "observation_sha256": hashlib.sha256(data).hexdigest(),
           "origin_path": result["origin"]["path"], "engine": result["engine"],
           "timings": _timings(result["pages"])}
    return data, run


def recognize_image(path: Path, *, backend: str | None = None,
                    config: PaddleConfig | VisionConfig | None = None,
                    regions: Sequence[OcrRegion] | None = None,
                    retry_regions: Sequence[OcrRegion] = ()) -> dict:
    """Read an upright image; coordinates refer to original image pixels."""
    backend = _backend(backend, config)
    selected = _config(backend, config)
    if backend == "paddle":
        return paddle_ocr.recognize_image(path, config=selected,
                                         regions=regions, retry_regions=retry_regions)
    if retry_regions:
        raise ValueError("Vision retries use separate calls with regions")
    return vision_ocr.recognize_image(path, config=selected, regions=regions)
