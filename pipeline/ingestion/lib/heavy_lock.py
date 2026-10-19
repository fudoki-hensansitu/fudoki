"""One machine-wide lock for the runs that occupy the machine (OCR, conversion, refresh).

Agent sessions start these from different worktrees on the same machine, so the lock cannot live in
a worktree's `.build/`. The earlier convention was a marker file under `/tmp`: it was broken twice
in one session (a run that never took the lock deleted another run's marker, and `rm -rf` of the
marker directory released nothing because the check was the file's existence). `flock` is released
by the kernel when the process exits, and this file lives under the user's state directory, so
cleaning temporary directories cannot unlock it.

The lock only serialises; it does not wait. A second run exits immediately with the holder's PID and
command, so a caller can decide between waiting for the holder's report and stopping.
"""
from __future__ import annotations

import fcntl
import json
import os
from pathlib import Path

HEAVY = frozenset({'convert', 'refresh', 'ocr'})
ENV = 'FUDOKI_HEAVY_LOCK'


def default_path() -> Path:
    """The state directory as the environment reads it now, not as it read at import."""
    base = Path(os.environ.get('XDG_STATE_HOME') or Path.home() / '.local' / 'state')
    return base / 'fudoki' / 'heavy.lock'


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


def acquire(command: str, path: Path | None = None) -> Holder | None:
    """Take the lock for a heavy command; return None for commands that do not occupy the machine."""
    if command not in HEAVY:
        return None
    target = Path(path or os.environ.get(ENV) or default_path())
    target.parent.mkdir(parents=True, exist_ok=True)
    stream = target.open('a+', encoding='utf-8')
    try:
        fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        try:
            stream.seek(0)
            holder = stream.read().strip() or 'another run'
        finally:
            stream.close()
        raise SystemExit(
            f'A heavy run already holds {target}: {holder}. '
            'Wait for it to finish and run again; do not delete the lock file.') from None
    stream.seek(0)
    stream.truncate()
    stream.write(json.dumps({'pid': os.getpid(), 'command': command, 'cwd': str(Path.cwd())},
                            ensure_ascii=False))
    stream.flush()
    return Holder(stream, target)
