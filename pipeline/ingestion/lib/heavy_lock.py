"""Machine-wide admission for the runs that occupy the machine (OCR, conversion, refresh).

Agent sessions start these from different worktrees on the same machine, so the locks cannot live
in a worktree's `.build/`. The earlier convention was a marker file under `/tmp`: it was broken
twice in one session (a run that never took the lock deleted another run's marker, and `rm -rf` of
the marker directory released nothing because the check was the file's existence). `flock` is
released by the kernel when the process exits, and these files live under the user's state
directory, so cleaning temporary directories cannot unlock them.

Measured: OCR uses all 8 cores for 80+ minutes. `convert` is heavy too, and `refresh` re-converts
every stale table through the same code, so the two are one class here. So the kinds are treated
differently instead of serialising everything:

- `ocr` is exclusive: it needs `<path>` itself (one OCR at a time) and no convert/refresh running.
- `convert` / `refresh` take one of `MAX_CONCURRENT` slot files. They may start while OCR runs, but
  only while the kernel's memory pressure is at most `MAX_PRESSURE_LEVEL`. Alone on the machine
  they always start.
- Every run also locks each manifest it writes (`targets`). Two runs on the same manifest would
  overwrite each other's saved tables and fingerprints, so the second is refused whatever its kind.

Memory pressure is the kernel's own level (`kern.memorystatus_vm_pressure_level`: 1 normal,
2 warning, 4 critical), read at the start. It is chosen over a swap threshold because swap stays
used after the pressure has eased, and over macOS "free" memory, which is not what the kernel acts
on. If the level cannot be read (the agent sandbox blocks sysctl) while another run is active, the
start is refused rather than guessed.

Nothing waits. A refused run exits immediately with the holders' PID and command and the reason
(memory pressure / concurrency limit / same target / OCR exclusion), so a caller can decide between waiting for the
report and stopping.
"""
from __future__ import annotations

import ctypes
import fcntl
import hashlib
import json
import os
import time
from pathlib import Path
from typing import Callable, Iterable

HEAVY = frozenset({'convert', 'refresh', 'ocr'})
ENV = 'FUDOKI_HEAVY_LOCK'
MAX_CONCURRENT = 2  # convert and refresh share these slots
MAX_PRESSURE_LEVEL = 1  # kern.memorystatus_vm_pressure_level: 1 normal, 2 warning, 4 critical


def default_path() -> Path:
    """The state directory as the environment reads it now, not as it read at import."""
    base = Path(os.environ.get('XDG_STATE_HOME') or Path.home() / '.local' / 'state')
    return base / 'fudoki' / 'heavy.lock'


def memory_pressure_level() -> int | None:
    """The kernel's memory pressure level, or None when it cannot be read."""
    try:
        value, size = ctypes.c_int(), ctypes.c_size_t(ctypes.sizeof(ctypes.c_int))
        libc = ctypes.CDLL(None, use_errno=True)
        if libc.sysctlbyname(b'kern.memorystatus_vm_pressure_level', ctypes.byref(value),
                             ctypes.byref(size), None, 0) != 0:
            return None
        return value.value
    except (OSError, AttributeError, TypeError):
        return None


class Holder:
    """The acquired lock. Closing releases it; the kernel also releases it when the process dies."""

    def __init__(self, stream, path: Path, extra=()):
        self.stream, self.path, self.extra = stream, path, list(extra)
        self.closed = False

    def close(self) -> None:
        if self.closed:
            return
        self.closed = True
        for stream in [self.stream, *self.extra]:
            try:
                stream.seek(0)
                stream.truncate()
            finally:
                stream.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


def _slot(path: Path, index: int) -> Path:
    return path.with_name(f'{path.name}.slot.{index}')


def _target(path: Path, manifest: Path) -> Path:
    digest = hashlib.sha256(str(Path(manifest).resolve()).encode()).hexdigest()[:16]
    return path.with_name(f'{path.name}.target.{digest}')


def _try_lock(target: Path):
    """An exclusive lock on the file, or None when another process holds it.

    A holder writes its record right after locking, so a held file that is still empty may only be
    another run's momentary probe (`_holder_of`); look again briefly before refusing.
    """
    for attempt in range(3):
        stream = target.open('a+', encoding='utf-8')
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return stream
        except BlockingIOError:
            stream.close()
        if target.read_text(encoding='utf-8').strip():
            return None
        time.sleep(0.02)
    return None


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
    targets = [path] + [_slot(path, i) for i in range(MAX_CONCURRENT)]
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


def _lock_targets(base: Path, command: str, targets: Iterable[Path]) -> list:
    streams = []
    for manifest in targets:
        target = _target(base, manifest)
        stream = _try_lock(target)
        if stream is None:
            for held in streams:
                held.close()
            raise _refuse(f'same target: {manifest} is already in use',
                          [_holder_of(target) or 'another run'], base)
        _write(stream, command)
        streams.append(stream)
    return streams


def acquire(command: str, path: Path | None = None,
            pressure: Callable[[], int | None] = memory_pressure_level,
            targets: Iterable[Path] = ()) -> Holder | None:
    """Admit a heavy command or exit at once; None for commands that do not occupy the machine.

    `targets` are the manifests the run writes; two runs never share one.
    """
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
        try:
            extra = _lock_targets(base, command, targets)
        except SystemExit:
            stream.close()
            raise
        _write(stream, command)
        return Holder(stream, base, extra)
    held = None
    for index in range(MAX_CONCURRENT):
        held = _slot(base, index)
        stream = _try_lock(held)
        if stream is not None:
            break
    else:
        raise _refuse(f'concurrency limit: {MAX_CONCURRENT} convert/refresh runs are already running',
                      _others(base, None), base)
    try:
        extra = _lock_targets(base, command, targets)
        others = _others(base, held)
        if others:
            level = pressure()
            if level is None or level > MAX_PRESSURE_LEVEL:
                shown = 'unreadable' if level is None else f'level {level} > {MAX_PRESSURE_LEVEL}'
                for stream_ in extra:
                    stream_.close()
                raise _refuse(f'memory pressure: {shown}', others, base)
    except SystemExit:
        stream.close()
        raise
    _write(stream, command)
    return Holder(stream, held, extra)
