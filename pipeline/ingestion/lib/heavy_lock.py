"""Machine-wide admission for the runs that occupy the machine (OCR, conversion, refresh).

Agent sessions start these from different worktrees on the same machine, so the locks cannot live
in a worktree's `.build/`. The earlier convention was a marker file under `/tmp`: it was broken
twice in one session (a run that never took the lock deleted another run's marker, and `rm -rf` of
the marker directory released nothing because the check was the file's existence). `flock` is
released by the kernel when the process exits, and these files live under the user's state
directory, so cleaning temporary directories cannot unlock them.

Measured: OCR uses all 8 cores for 80+ minutes; a refresh uses one core and about 160 MB. So the
kinds are treated differently instead of serialising everything:

- `ocr` is exclusive: it needs `<path>` itself (one OCR at a time) and no convert/refresh running.
- `convert` / `refresh` take one of `MAX_SAME_KIND` slot files of their kind. They may start while
  OCR (or the other kind) runs, but only while the kernel's memory pressure is at most
  `MAX_PRESSURE_LEVEL`. Alone on the machine they always start.

Memory pressure is the kernel's own level (`kern.memorystatus_vm_pressure_level`: 1 normal,
2 warning, 4 critical), read at the start. It is chosen over a swap threshold because swap stays
used after the pressure has eased, and over macOS "free" memory, which is not what the kernel acts
on. If the level cannot be read (the agent sandbox blocks sysctl) while another run is active, the
start is refused rather than guessed.

Nothing waits. A refused run exits immediately with the holders' PID and command and the reason
(memory pressure / same-kind limit / OCR exclusion), so a caller can decide between waiting for the
report and stopping.
"""
from __future__ import annotations

import ctypes
import ctypes.util
import fcntl
import json
import os
from pathlib import Path
from typing import Callable

HEAVY = frozenset({'convert', 'refresh', 'ocr'})
CONCURRENT = ('convert', 'refresh')
ENV = 'FUDOKI_HEAVY_LOCK'
MAX_SAME_KIND = 2
MAX_PRESSURE_LEVEL = 1  # kern.memorystatus_vm_pressure_level: 1 normal, 2 warning, 4 critical


def default_path() -> Path:
    """The state directory as the environment reads it now, not as it read at import."""
    base = Path(os.environ.get('XDG_STATE_HOME') or Path.home() / '.local' / 'state')
    return base / 'fudoki' / 'heavy.lock'


def memory_pressure_level() -> int | None:
    """The kernel's memory pressure level, or None when it cannot be read."""
    try:
        value, size = ctypes.c_int(), ctypes.c_size_t(ctypes.sizeof(ctypes.c_int))
        libc = ctypes.CDLL(ctypes.util.find_library('c'), use_errno=True)
        if libc.sysctlbyname(b'kern.memorystatus_vm_pressure_level', ctypes.byref(value),
                             ctypes.byref(size), None, 0) != 0:
            return None
        return value.value
    except (OSError, AttributeError, TypeError):
        return None


class Holder:
    """The acquired lock. Closing releases it; the kernel also releases it when the process dies."""

    def __init__(self, stream, path: Path):
        self.stream, self.path = stream, path
        self.closed = False

    def close(self) -> None:
        if self.closed:
            return
        self.closed = True
        try:
            self.stream.seek(0)
            self.stream.truncate()
        finally:
            self.stream.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


def _slot(path: Path, kind: str, index: int) -> Path:
    return path.with_name(f'{path.name}.{kind}.{index}')


def _try_lock(target: Path):
    """An exclusive lock on the file, or None when another process holds it."""
    stream = target.open('a+', encoding='utf-8')
    try:
        fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        stream.close()
        return None
    return stream


def _holder_of(target: Path) -> str | None:
    """What the file's holder wrote, or None when nobody holds it (probe and release at once)."""
    if not target.exists():
        return None
    stream = _try_lock(target)
    if stream is not None:
        stream.close()
        return None
    try:
        return target.read_text(encoding='utf-8').strip() or 'another run'
    except OSError:
        return 'another run'


def _others(path: Path, mine: Path | None) -> list[str]:
    targets = [path] + [_slot(path, kind, i) for kind in CONCURRENT for i in range(MAX_SAME_KIND)]
    return [info for target in targets if target != mine and (info := _holder_of(target))]


def _refuse(reason: str, holders: list[str], target: Path) -> SystemExit:
    return SystemExit(
        f'Heavy run refused ({reason}). Holders [{target.parent}]: {"; ".join(holders) or "none"}. '
        'Wait for them to finish and run again; do not delete the lock files.')


def _write(stream, command: str) -> None:
    stream.seek(0)
    stream.truncate()
    stream.write(json.dumps({'pid': os.getpid(), 'command': command, 'cwd': str(Path.cwd())},
                            ensure_ascii=False))
    stream.flush()


def acquire(command: str, path: Path | None = None,
            pressure: Callable[[], int | None] = memory_pressure_level) -> Holder | None:
    """Admit a heavy command or exit at once; None for commands that do not occupy the machine."""
    if command not in HEAVY:
        return None
    base = Path(path or os.environ.get(ENV) or default_path())
    base.parent.mkdir(parents=True, exist_ok=True)
    if command == 'ocr':
        stream = _try_lock(base)
        if stream is None:
            raise _refuse('OCR exclusion: another OCR is running', _others(base, None), base)
        running = _others(base, base)
        if running:
            stream.close()
            raise _refuse('OCR exclusion: convert/refresh is running', running, base)
        _write(stream, command)
        return Holder(stream, base)
    held = None
    for index in range(MAX_SAME_KIND):
        held = _slot(base, command, index)
        stream = _try_lock(held)
        if stream is not None:
            break
    else:
        raise _refuse(f'same-kind limit: {MAX_SAME_KIND} {command} runs are already running',
                      _others(base, None), base)
    others = _others(base, held)
    if others:
        level = pressure()
        if level is None or level > MAX_PRESSURE_LEVEL:
            stream.close()
            shown = 'unreadable' if level is None else f'level {level} > {MAX_PRESSURE_LEVEL}'
            raise _refuse(f'memory pressure: {shown}', others, base)
    _write(stream, command)
    return Holder(stream, held)
