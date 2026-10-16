"""Long printed rules (table lines) of displayed PDF pages, for text and scan PDFs alike.

Rules are found on a Poppler grayscale render, so vector lines and scanned lines are
read the same way. Positions are displayed-page points (CropBox and rotation applied,
top-left origin), the same coordinates as OCR ``bbox_pdf_pt`` and Poppler words.
Only lines longer than a fraction of the page are returned (vertical 5%, horizontal 20%,
so a short table still has its column rules); text strokes are far shorter.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import subprocess

import numpy as np

DPI = 144
DARK = 128


@dataclass(frozen=True)
class Rule:
    position: float  # x of a vertical rule, y of a horizontal one
    start: float
    end: float
    thickness: float = 0.0

    def covers(self, value: float, tolerance: float = 0.0) -> bool:
        return self.start - tolerance <= value <= self.end + tolerance


@dataclass(frozen=True)
class PageRules:
    page: int
    width: float
    height: float
    vertical: tuple[Rule, ...]
    horizontal: tuple[Rule, ...]


def render(pdf: Path, page: int, dpi: int = DPI) -> np.ndarray:
    """Grayscale render of one physical page as a (height, width) uint8 array."""
    data = subprocess.check_output(['pdftoppm', '-gray', '-r', str(dpi), '-f', str(page), '-l', str(page),
                                    str(pdf)])
    magic, size, depth, pixels = data.split(b'\n', 3)
    if magic != b'P5' or depth != b'255':
        raise ValueError('Unexpected pdftoppm output; expected 8-bit PGM')
    width, height = map(int, size.split())
    return np.frombuffer(pixels, np.uint8, count=width * height).reshape(height, width)


def _runs(dark: np.ndarray, minimum: int) -> list[tuple[int, int, int]]:
    """Every long dark run per column of ``dark`` as (column, start, end).

    All runs are kept, so two tables side by side (or stacked) keep their own lines.
    """
    padded = np.zeros((dark.shape[0] + 2, dark.shape[1]), np.int8)
    padded[1:-1] = dark
    edges = np.diff(padded, axis=0)
    found = []
    for column in range(dark.shape[1]):
        starts = np.flatnonzero(edges[:, column] == 1)
        ends = np.flatnonzero(edges[:, column] == -1)
        for start, end in zip(starts, ends):
            if end - start >= minimum:
                found.append((column, int(start), int(end)))
    return found


def _merge(runs: list[tuple[int, int, int]], scale: float) -> tuple[Rule, ...]:
    """Adjacent columns whose runs overlap are one stroke; it sits at their mean position."""
    groups: list[list[tuple[int, int, int]]] = []
    for run in runs:
        for group in groups:
            last = group[-1]
            if 0 < run[0] - last[0] <= 2 and run[1] < last[2] and last[1] < run[2]:
                group.append(run)
                break
        else:
            groups.append([run])
    rules = [Rule(round(sum(r[0] + 0.5 for r in g) / len(g) * scale, 1),
                  round(min(r[1] for r in g) * scale, 1), round(max(r[2] for r in g) * scale, 1),
                  round((g[-1][0] - g[0][0] + 1) * scale, 2))
             for g in groups]
    return tuple(sorted(rules, key=lambda rule: (rule.position, rule.start)))


def detect(pdf: Path, page: int, *, dpi: int = DPI, vertical_fraction: float = 0.05,
           horizontal_fraction: float = 0.2, dark: int = DARK) -> PageRules:
    """`dark` is the gray level below which a pixel is ink; a scan that prints its rules pale declares a higher one."""
    image = render(pdf, page, dpi)
    dark = image < dark
    scale = 72 / dpi
    height, width = dark.shape
    return PageRules(page, round(width * scale, 1), round(height * scale, 1),
                     _merge(_runs(dark, int(height * vertical_fraction)), scale),
                     _merge(_runs(dark.T, int(width * horizontal_fraction)), scale))
