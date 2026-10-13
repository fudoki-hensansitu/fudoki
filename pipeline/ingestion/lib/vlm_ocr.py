"""Read one cropped area of a PDF page with a vision LLM, as the fallback of Vision OCR.

A model named ``codex/<model>`` is called through ``codex exec``; any other through the
``pi`` coding agent on OpenCode Go, never its HTTP API directly (Go is for coding agents and
wants their session header). Both write to the home directory, so run this outside a sandbox. Answers are pinned in the OCR observation (ADR 0019); the
converters never call a model.
"""
from __future__ import annotations

from pathlib import Path
import subprocess
import tempfile
import time

# gpt-6-luna reads best. Through Codex while the OpenCode Go quota is spent; back to
# 'opencode-go/gpt-6-luna' once it resets.
MODEL = 'codex/gpt-6-luna'
UNREADABLE = 'UNREADABLE'
ATTEMPTS = 5
SYSTEM = 'You read printed text in images and answer only with that text.'
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
        image = root.with_suffix('.png')
        if model.startswith('codex/'):
            answer_file = Path(tmp) / 'answer.txt'
            # Run from the empty temporary directory so no AGENTS.md is sent with the image.
            command = ['codex', 'exec', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config',
                       '-s', 'read-only', '-m', model.removeprefix('codex/'), '-c', 'model_reasoning_effort=low',
                       '-i', str(image), '-o', str(answer_file), prompt]
        else:
            answer_file = None
            # Without these flags pi sends its coding-agent prompt and AGENTS.md files: ~7,700 tokens
            # and about 15 times the cost of the reading itself.
            command = ['pi', '-p', '--no-session', '--no-tools', '--no-extensions', '--no-skills',
                       '--no-context-files', '--no-prompt-templates', '--system-prompt', SYSTEM,
                       '--model', model, '@' + str(image), prompt]
        error = ''
        for attempt in range(ATTEMPTS):
            try:
                run = subprocess.run(command, capture_output=True, text=True, timeout=60, stdin=subprocess.DEVNULL,
                                     cwd=tmp)
            except subprocess.TimeoutExpired:
                error = 'timed out'
            else:
                if not run.returncode:
                    return (answer_file.read_text() if answer_file else run.stdout).strip()
                error = run.stderr[-300:]
                # Busy models answer 429 or "unavailable"; other errors do not pass.
                if not any(word in error for word in ('429', 'navailable', 'rate')):
                    break
            time.sleep(10 * 2 ** attempt)
    raise RuntimeError(f'{command[0]} failed: {error}')
