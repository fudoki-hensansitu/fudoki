"""The Poppler that reads text PDFs must be the pinned one (`pipeline/poppler-version`).

Words come from `pdftotext -bbox`; another version, or one without its CJK data, reads the same PDF into
other words, and a conversion then differs from the saved table for reasons outside the code. The words
cached in `.cache/generic-observation` are keyed without the version: after changing Poppler, empty that
directory before converting. `require` checks the version only; `scripts/install_poppler.sh` checks the CJK data.
"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

VERSION_FILE = Path(__file__).resolve().parents[2] / 'poppler-version'
INSTALL = 'macOS: brew install poppler && brew pin poppler / Linux: bash pipeline/scripts/install_poppler.sh'


def pinned() -> str:
    return VERSION_FILE.read_text().strip()


def installed() -> str | None:
    try:
        result = subprocess.run(['pdftotext', '-v'], capture_output=True, text=True, check=False)
    except FileNotFoundError:
        return None
    found = re.search(r'pdftotext version (\S+)', result.stdout + result.stderr)
    return found.group(1) if found else None


def require() -> None:
    """Stop before reading any PDF when `pdftotext` is not the pinned version."""
    want, have = pinned(), installed()
    if have != want:
        raise SystemExit(f'pdftotext {have or "not found"} is not the pinned Poppler {want} ({VERSION_FILE.name}). {INSTALL}')
