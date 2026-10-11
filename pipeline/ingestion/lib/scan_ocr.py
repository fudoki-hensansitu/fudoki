"""Scan OCR entry point: Apple Vision by default, PaddleOCR on request.

Vision is the default because it reads the real scans more accurately. Paddle
stays available through ``backend="paddle"``. When ``backend`` is omitted and a
config is passed, the config type names the engine, so the legacy Paddle
capture scripts that pass a ``PaddleConfig`` are not silently switched.
"""
from __future__ import annotations

from pathlib import Path
from typing import Mapping, Sequence

from . import paddle_ocr, vision_ocr
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
