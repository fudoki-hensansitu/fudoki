"""Scan OCR entry point: Apple Vision by default, PaddleOCR on request.

Vision is the default because it reads the real scans more accurately. Paddle
stays available through ``backend="paddle"``. When ``backend`` is omitted and a
config is passed, the config type names the engine, so the legacy Paddle
capture scripts that pass a ``PaddleConfig`` are not silently switched.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import replace
from pathlib import Path
from typing import Mapping, Sequence

from . import paddle_ocr, pdf_rules, vision_ocr
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


def acquire(path: Path, request: Mapping) -> tuple[bytes, dict]:
    """Read one declared OCR request; return canonical observation bytes and a run record.

    The observation holds only what the request read and what OCR returned, so
    re-reading with the same engine and renderer yields identical bytes (ADR 0019).
    Elapsed time, local paths and the environment go to the run record.
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
    observation = {"schema_version": 1, "request": dict(request),
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
