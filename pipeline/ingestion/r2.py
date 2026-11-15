"""`cf r2 objects` with a wait on rate limiting.

`cf` goes through the Cloudflare REST API, which allows about 1,200 requests per 5 minutes for the whole
account (shared with every CI job running at the time). When the CI object cache is lost, a full build reads
thousands of tables, so a 429 is waited out instead of failing the job."""
from __future__ import annotations

import subprocess
import sys
import time
from typing import IO

# Seconds to wait before each retry: about 6 minutes in all, longer than the 5-minute window.
WAITS = (15, 30, 45, 60, 60, 60, 60, 60)


def objects(*args: str, stdout: IO[bytes] | int | None = None) -> subprocess.CompletedProcess:
    """Run `cf r2 objects <args>`. stdout is a file to write the object to, or DEVNULL; when it is None the
    output is returned. A failure other than a 429 raises at once, with cf's message on stderr."""
    command = ['cf', 'r2', 'objects', *args]
    for wait in (*WAITS, None):
        done = subprocess.run(command, stdout=subprocess.PIPE if stdout is None else stdout, stderr=subprocess.PIPE)
        if done.returncode == 0:
            return done
        if wait is None or b'429' not in done.stderr:
            sys.stderr.buffer.write(done.stderr)
            sys.stderr.flush()
            raise subprocess.CalledProcessError(done.returncode, command, done.stdout, done.stderr)
        print(f'cf r2 rate limited; retrying in {wait}s: {" ".join(args[:2])}', file=sys.stderr, flush=True)
        time.sleep(wait)
        if hasattr(stdout, 'truncate'):
            stdout.seek(0)
            stdout.truncate()
    raise AssertionError('unreachable')
