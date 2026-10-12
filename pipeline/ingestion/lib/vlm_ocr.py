"""Read one cropped area of a PDF page with a vision LLM, as the fallback of Vision OCR.

The model is called through the ``pi`` coding agent on OpenCode Go, never its HTTP API
directly (Go is for coding agents and wants their session header). ``pi`` writes to ~/.pi,
so run this outside a sandbox. Answers are pinned in the OCR observation (ADR 0019); the
converters never call a model.
"""
from __future__ import annotations

from pathlib import Path
import re
import subprocess
import tempfile
import time

# gpt-6-luna reads best but spends the OpenCode Go quota. The free longcat preview reads the
# hard cases (修繕料, 工事費, 0) and gives 一 as ー, which ``scan_ocr._fill`` puts right.
MODEL = 'opencode-go/longcat-2.5-preview-free'
UNREADABLE = 'UNREADABLE'
ATTEMPTS = 5
SYSTEM = 'You read printed text in images and answer only with that text.'
TEXT_PROMPT = ('画像は日本の決算書の表の一部を切り出したものです。印字されている文字を原文のまま答えてください。'
               '横線1本だけの字や記号も文字として扱います。文字以外は書かないでください。'
               '読めない場合は UNREADABLE と答えてください。')


def answer(text: str) -> str:
    """The printed text of a reply: some models wrap it as LaTeX ``\\boxed{0}`` or in backticks."""
    text = text.strip().strip('`').strip()
    boxed = re.fullmatch(r'\\boxed\{(.*)\}', text, re.S)
    return boxed.group(1).strip() if boxed else text


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
        # Without these flags pi sends its coding-agent prompt and AGENTS.md files: ~7,700 tokens
        # and about 15 times the cost of the reading itself.
        command = ['pi', '-p', '--no-session', '--no-tools', '--no-extensions', '--no-skills',
                   '--no-context-files', '--no-prompt-templates', '--system-prompt', SYSTEM,
                   '--model', model, '@' + str(root.with_suffix('.png')), prompt]
        error = ''
        for attempt in range(ATTEMPTS):
            try:
                run = subprocess.run(command, capture_output=True, text=True, timeout=60, stdin=subprocess.DEVNULL)
            except subprocess.TimeoutExpired:
                error = 'timed out'
            else:
                if not run.returncode:
                    return answer(run.stdout)
                error = run.stderr[-300:]
                # Free models answer 429 or "unavailable" under load; other errors do not pass.
                if not any(word in error for word in ('429', 'navailable', 'rate')):
                    break
            time.sleep(10 * 2 ** attempt)
    raise RuntimeError(f'pi failed: {error}')
