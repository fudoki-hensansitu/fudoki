"""Read one cropped area of a PDF page with a vision LLM, as the fallback of Vision OCR.

The model is called through the ``pi`` coding agent on OpenCode Go, never its HTTP API
directly (Go is for coding agents and wants their session header). ``pi`` writes to ~/.pi,
so run this outside a sandbox. Answers are pinned in the OCR observation (ADR 0019); the
converters never call a model.
"""
from __future__ import annotations

from pathlib import Path
import subprocess
import tempfile

MODEL = 'opencode-go/gpt-6-luna'
UNREADABLE = 'UNREADABLE'
TEXT_PROMPT = ('画像は日本の決算書の表の一部を切り出したものです。印字されている文字を原文のまま答えてください。'
               '横線1本だけの字や記号も文字として扱います。文字以外は書かないでください。'
               '読めない場合は UNREADABLE と答えてください。')


def read(pdf: Path, page: int, box: tuple[float, float, float, float], prompt: str = TEXT_PROMPT, *,
         model: str = MODEL, margin: float = 4.0, dpi: int = 300) -> str:
    """The model's answer for ``box`` (displayed-page points) widened by ``margin`` points."""
    x0, y0, x1, y1 = box
    scale = dpi / 72
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp) / 'crop'
        subprocess.run(['pdftoppm', '-r', str(dpi), '-f', str(page), '-l', str(page),
                        '-x', str(int(max(0.0, x0 - margin) * scale)), '-y', str(int(max(0.0, y0 - margin) * scale)),
                        '-W', str(int((x1 - x0 + 2 * margin) * scale)), '-H', str(int((y1 - y0 + 2 * margin) * scale)),
                        '-png', '-singlefile', str(pdf), str(root)], check=True)
        run = subprocess.run(['pi', '-p', '--no-session', '--no-tools', '--no-extensions', '--no-skills',
                              '--model', model, '@' + str(root.with_suffix('.png')), prompt],
                             capture_output=True, text=True, timeout=300, stdin=subprocess.DEVNULL)
    if run.returncode:
        raise RuntimeError(f'pi failed: {run.stderr[-300:]}')
    return run.stdout.strip()
