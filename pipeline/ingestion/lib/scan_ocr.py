"""Scan OCR entry point: Apple Vision by default, PaddleOCR on request.

Vision is the default because it reads the real scans more accurately. Paddle
stays available through ``backend="paddle"``. When ``backend`` is omitted and a
config is passed, the config type names the engine, so the legacy Paddle
capture scripts that pass a ``PaddleConfig`` are not silently switched.
"""
from __future__ import annotations

from collections import deque
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from dataclasses import replace
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
    return "paddle" if isinstance(config, PaddleConfig) else "vision"


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

    Apple Vision is the default. Paddle retries are ordered, caller-declared
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
    return [{"page_number": page["page_number"], "region": region["id"],
             **{k: region[k] for k in RUN_FIELDS if k in region}}
            for page in pages for region in page["regions"]]


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
MIN_PIXELS = 12      # smaller marks are specks


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


def ink_areas(marks: Sequence[Sequence[float]], rules: PageRules) -> list[tuple[float, float, float, float]]:
    """Marks on one text line and in one cell become one area, kept 1pt inside the cell's rules
    (OCR reads an edge rule as 1 or l and then drops the digit next to it)."""
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
        left = max([r.position + 1 for r in rules.vertical if r.position <= x0 and r.covers(middle)], default=0.0)
        right = min([r.position - 1 for r in rules.vertical if r.position >= x1 and r.covers(middle)],
                    default=rules.width)
        areas.append((max(left, x0 - 3), max(0.0, middle - half), min(right, x1 + 3), min(rules.height, middle + half)))
    return areas


def _overlaps(box: Sequence[float], other: Sequence[float]) -> bool:
    width = max(0.0, min(box[2], other[2]) - max(box[0], other[0]))
    height = max(0.0, min(box[3], other[3]) - max(box[1], other[1]))
    return width * height > 0.3 * max((box[2] - box[0]) * (box[3] - box[1]), 1e-9)


def _boxes(page: dict) -> list[list[float]]:
    return [o["bbox_pdf_pt"] for region in page["regions"] for o in region["observations"] if o.get("bbox_pdf_pt")]


def _key(page: int, box: Sequence[float]) -> str:
    return f"{page}:" + ",".join(f"{v:.1f}" for v in box)


def supplement(path: Path, page: dict, config: VisionConfig, previous: Mapping[str, str]) -> dict:
    """Read the ink OCR missed on one page: Vision on those areas, then the VLM on what remains.

    Vision areas are new regions ``ink-<n>``; a reading that overlaps an existing box is a
    duplicate and is dropped. For marks still uncovered, the VLM reads their whole line in
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
    areas = ink_areas(marks, rules)
    regions = [OcrRegion(f"ink-{i}", (a[0] / rules.width, a[1] / rules.height, a[2] / rules.width, a[3] / rules.height))
               for i, a in enumerate(areas)]
    read = recognize_pdf(path, pages=[number], backend="vision", config=replace(config, region_padding_px=60),
                         regions=regions)["pages"][0]
    existing = _boxes(page)
    for region in read["regions"]:
        kept = {o["id"] for o in region["observations"] if o["kind"] == "region" and o.get("bbox_pdf_pt")
                and not any(_overlaps(o["bbox_pdf_pt"], box) for box in existing)}
        region["observations"] = [o for o in region["observations"] if o["id"] in kept or o.get("parent_id") in kept]
        if region["observations"]:
            page["regions"].append(region)
    rest = ink_areas(missed_ink(dark, scale, _boxes(page)), rules)
    keys = [_key(number, area) for area in rest]
    lines = {key: _line(area, rules) for area, key in zip(rest, keys)}
    asked = [key for key in keys if key not in previous]
    with ThreadPoolExecutor(4) as pool:
        answers = dict(zip(asked, pool.map(lambda key: vlm_ocr.read(path, number, lines[key], margin=2.0), asked)))
    unread, added = [], []
    for index, (area, key) in enumerate(zip(rest, keys)):
        if key in previous:
            text = previous[key]
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
    return page


def _line(area: Sequence[float], rules: PageRules) -> tuple[float, float, float, float]:
    """The text line of ``area`` across its cell: the VLM reads it with its context."""
    middle = (area[1] + area[3]) / 2
    left = max([r.position + 1 for r in rules.vertical if r.position <= area[0] and r.covers(middle)], default=0.0)
    right = min([r.position - 1 for r in rules.vertical if r.position >= area[2] and r.covers(middle)],
                default=rules.width)
    return (left, area[1], right, area[3])


def _tokens(page: dict, line: Sequence[float]) -> list[tuple[str, list[float]]]:
    """OCR lines whose centre lies in ``line``, left to right, as (text without spaces, box)."""
    found = []
    for region in page["regions"]:
        for o in region["observations"]:
            box = o.get("bbox_pdf_pt")
            if o["kind"] == "region" and box and line[0] <= (box[0] + box[2]) / 2 <= line[2] \
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
        return reading
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
    return reading[start:end]


def _vlm_identity() -> dict:
    # ``read`` names how an answer becomes text; changing it invalidates pinned answers.
    return {"model": vlm_ocr.MODEL, "prompt_sha256": hashlib.sha256(vlm_ocr.TEXT_PROMPT.encode()).hexdigest(),
            "read": "cell-line-minus-ocr"}


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
    Elapsed time, local paths and the environment go to the run record. Ink that Vision
    missed is read again (``supplement``); VLM answers of ``previous`` are reused.
    """
    if request.get("engine") != "vision":
        raise ValueError("OCR inputs are acquired with Apple Vision only")
    config = VisionConfig(**request.get("config", {}))
    path = Path(path)
    regions = [OcrRegion(r["id"], tuple(r["bbox_normalized"])) for r in request["regions"]] \
        if "regions" in request else None
    result = recognize_pdf(path, pages=request["pages"], backend="vision", config=config, regions=regions)
    # Vision can return nothing for a whole dense page without an error. Such a page is
    # read again in column tiles bounded by its rules; still empty, it stops here.
    for index, page in enumerate(result["pages"]):
        if not any(region["observations"] for region in page["regions"]):
            tiles = column_tiles(pdf_rules.detect(path, page["page_number"]),
                                 pdf_rules.render(path, page["page_number"]) < pdf_rules.DARK)
            result["pages"][index] = recognize_pdf(path, pages=[page["page_number"]], backend="vision",
                                                   config=replace(config, region_padding_px=60),
                                                   regions=tiles)["pages"][0]
    empty = [page["page_number"] for page in result["pages"]
             if not any(region["observations"] for region in page["regions"])]
    if empty:
        raise ValueError(f"OCR returned no text for pages {empty}")
    pinned = _pinned_answers(previous)
    result["pages"] = [supplement(path, page, config, pinned) for page in result["pages"]]
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
