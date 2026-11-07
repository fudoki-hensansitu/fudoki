"""The Poppler that reads text PDFs must be the one pinned in mise.toml (`conda:poppler`).

Words come from `pdftotext -bbox`; another version, or one without its CJK data, reads the same PDF into
other words, and a conversion then differs from the saved table for reasons outside the code. mise installs
conda-forge's build and `scripts/fix_poppler_datadir.py` lets it find the CJK data; `require` checks the
version only. The words cached in `.cache/generic-observation` are keyed without the version: after changing
Poppler, empty that directory before converting.
"""
from __future__ import annotations

import re
import subprocess
import tomllib
from pathlib import Path

MISE = Path(__file__).resolve().parents[3] / 'mise.toml'
TOOL = 'conda:poppler'
INSTALL = 'Run `mise install` and convert with mise on PATH (`mise activate`, or `mise exec -- ...`).'


def pinned() -> str:
    spec = tomllib.loads(MISE.read_text())['tools'][TOOL]
    return spec['version'] if isinstance(spec, dict) else spec


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
        raise SystemExit(f'pdftotext {have or "not found"} is not the pinned Poppler {want} ({TOOL} in mise.toml). {INSTALL}')
