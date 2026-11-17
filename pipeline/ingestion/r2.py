"""`cf r2 objects` with a wait on rate limiting.

`cf` goes through the Cloudflare REST API, which allows about 1,200 requests per 5 minutes for the whole
account (shared with every CI job running at the time). When the CI object cache is lost, a full build reads
thousands of tables, so a 429 is waited out instead of failing the job.

When `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` are set (a read-only R2 API token), `get` reads through
R2's S3-compatible API instead, which has no such account-wide limit. Writes, lists and deletes stay on cf
(Cloudflare writes go through cf)."""
from __future__ import annotations

import datetime
import hashlib
import hmac
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import IO

# Seconds to wait before each retry: about 6 minutes in all, longer than the 5-minute window.
WAITS = (15, 30, 45, 60, 60, 60, 60, 60)


def objects(*args: str, stdout: IO[bytes] | int | None = None, quiet: bool = False) -> subprocess.CompletedProcess:
    """Run `cf r2 objects <args>`. stdout is a file to write the object to, or DEVNULL; when it is None the
    output is returned. A failure other than a 429 raises at once, with cf's message on stderr unless quiet
    (the error carries it either way)."""
    command = ['cf', 'r2', 'objects', *args]
    if args[:1] == ('get',) and os.environ.get('R2_ACCESS_KEY_ID') and os.environ.get('R2_SECRET_ACCESS_KEY'):
        return s3_get(command, args[1], args[args.index('--bucket-name') + 1], stdout, quiet)
    for wait in (*WAITS, None):
        done = subprocess.run(command, stdout=subprocess.PIPE if stdout is None else stdout, stderr=subprocess.PIPE)
        if done.returncode == 0:
            return done
        # cf prints the object's URL in every error, and a key can contain "429"; match the status line.
        if wait is None or b'429 Too Many Requests' not in done.stderr:
            if not quiet:
                print(done.stderr.decode(errors='replace'), end='', file=sys.stderr, flush=True)
            raise subprocess.CalledProcessError(done.returncode, command, done.stdout, done.stderr)
        print(f'cf r2 rate limited; retrying in {wait}s: {" ".join(args[:2])}', file=sys.stderr, flush=True)
        time.sleep(wait)
        if hasattr(stdout, 'truncate'):
            stdout.seek(0)
            stdout.truncate()
    raise AssertionError('unreachable')


def s3_get(command: list[str], key: str, bucket: str, stdout: IO[bytes] | int | None, quiet: bool) -> subprocess.CompletedProcess:
    """GET one object through R2's S3-compatible API (AWS Signature V4, region auto), shaped like cf's result.
    A missing object raises with "does not exist" on stderr, as cf does; 5xx and 429 are retried."""
    account = os.environ['CLOUDFLARE_ACCOUNT_ID']
    host = f'{account}.r2.cloudflarestorage.com'
    path = '/' + urllib.parse.quote(f'{bucket}/{key}', safe='/-_.~')
    for wait in (*WAITS, None):
        request = urllib.request.Request(f'https://{host}{path}', headers=signed_headers(host, path))
        try:
            with urllib.request.urlopen(request, timeout=300) as response:
                if stdout is None:
                    return subprocess.CompletedProcess(command, 0, response.read(), b'')
                if stdout != subprocess.DEVNULL:
                    shutil.copyfileobj(response, stdout)
                    stdout.flush()
                return subprocess.CompletedProcess(command, 0, None, b'')
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as error:
            status = getattr(error, 'code', None)
            if status == 404:
                stderr = f'The specified object does not exist: {bucket}/{key}\n'.encode()
            else:
                stderr = f'R2 S3 GET failed ({status or error}): {bucket}/{key}\n'.encode()
            if wait is None or (status is not None and status != 429 and status < 500):
                if not quiet:
                    print(stderr.decode(), end='', file=sys.stderr, flush=True)
                raise subprocess.CalledProcessError(1, command, None, stderr) from error
            print(f'R2 S3 GET failed ({status or error}); retrying in {wait}s: {key}', file=sys.stderr, flush=True)
            time.sleep(wait)
            if hasattr(stdout, 'truncate'):
                stdout.seek(0)
                stdout.truncate()
    raise AssertionError('unreachable')


def signed_headers(host: str, path: str) -> dict[str, str]:
    """The headers of an unsigned-payload GET signed with AWS Signature V4 for R2 (region auto, service s3)."""
    now = datetime.datetime.now(datetime.timezone.utc)
    stamp, day = now.strftime('%Y%m%dT%H%M%SZ'), now.strftime('%Y%m%d')
    payload = 'UNSIGNED-PAYLOAD'
    signed = 'host;x-amz-content-sha256;x-amz-date'
    canonical = f'GET\n{path}\n\nhost:{host}\nx-amz-content-sha256:{payload}\nx-amz-date:{stamp}\n\n{signed}\n{payload}'
    scope = f'{day}/auto/s3/aws4_request'
    to_sign = f'AWS4-HMAC-SHA256\n{stamp}\n{scope}\n{hashlib.sha256(canonical.encode()).hexdigest()}'
    key = ('AWS4' + os.environ['R2_SECRET_ACCESS_KEY']).encode()
    for part in (day, 'auto', 's3', 'aws4_request'):
        key = hmac.new(key, part.encode(), hashlib.sha256).digest()
    signature = hmac.new(key, to_sign.encode(), hashlib.sha256).hexdigest()
    return {
        'x-amz-date': stamp,
        'x-amz-content-sha256': payload,
        'Authorization': f'AWS4-HMAC-SHA256 Credential={os.environ["R2_ACCESS_KEY_ID"]}/{scope}, '
                         f'SignedHeaders={signed}, Signature={signature}',
    }
