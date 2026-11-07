"""The Poppler that reads text PDFs must be the one pinned in mise.toml (`conda:poppler`).

Words come from `pdftotext -bbox`; another version, or one without its CJK data, reads the same PDF into
other words, and a conversion then differs from the saved table for reasons outside the code. mise installs
conda-forge's build and `scripts/fix_poppler_datadir.py` lets it find the CJK data; `require` checks the
version and that a conda build was so fixed (a Homebrew build of the same version finds its data as is). The words cached in `.cache/generic-observation` are keyed without the version: after changing
Poppler, empty that directory before converting.
"""
from __future__ import annotations

import re
import shutil
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


def unfixed_library() -> Path | None:
    """The libpoppler next to `pdftotext` whose data directory still ends in NULs (see fix_poppler_datadir.py)."""
    found = shutil.which('pdftotext')
    if not found:
        return None
    if '/mise/shims/' in found:  # a shim resolves the tool only when asked
        found = subprocess.run(['mise', 'which', 'pdftotext'], capture_output=True, text=True, check=False).stdout.strip()
    prefix = Path(found).resolve().parent.parent
    # A C string ends in one NUL (Homebrew's is followed by the next string); conda's unfixed one in a long run.
    padded = f'{prefix}/share/poppler'.encode() + b'\0' * 32
    if not (prefix / 'conda-meta').is_dir():  # only conda's build is relocated this way
        return None
    for library in [*prefix.glob('lib/libpoppler.so.*'), *prefix.glob('lib/libpoppler.*.dylib')]:
        if not library.is_symlink() and padded in library.read_bytes():
            return library
    return None


def require() -> None:
    """Stop before reading any PDF when `pdftotext` is not the pinned version."""
    want, have = pinned(), installed()
    if have != want:
        raise SystemExit(f'pdftotext {have or "not found"} is not the pinned Poppler {want} ({TOOL} in mise.toml). {INSTALL}')
    if library := unfixed_library():
        raise SystemExit(f'{library} cannot find its CJK data. Run `mise install -f {TOOL}@{want}` so that '
                         'pipeline/scripts/fix_poppler_datadir.py runs.')
