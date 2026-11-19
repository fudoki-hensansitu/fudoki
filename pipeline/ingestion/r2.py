"""`cf r2 objects` with a wait on rate limiting.

`cf` goes through the Cloudflare REST API, which allows about 1,200 requests per 5 minutes for the whole
account (shared with every CI job running at the time). When the CI object cache is lost, a full build reads
thousands of tables, so a 429 is waited out instead of failing the job.

`get` reads through R2's S3-compatible API instead, which has no such account-wide limit. Its credentials come
from the same `CLOUDFLARE_API_TOKEN` (an API token is also an S3 key: the token's id is the access key id and
the SHA-256 of its value the secret). The token needs R2 read on the bucket, as cf's get already does. Without a
token, or when it cannot be verified, `get` stays on cf. Writes, lists and deletes stay on cf
(Cloudflare writes go through cf)."""
from __future__ import annotations

import datetime
import hashlib
import hmac
import http.client
import json
import os
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
    if args[:1] == ('get',) and (keys := s3_keys()):
        return s3_get(command, keys, args[1], args[args.index('--bucket-name') + 1], stdout, quiet)
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


_KEYS: list[tuple[str, str] | None] = []


def s3_keys() -> tuple[str, str] | None:
    """The S3 access key id and secret, worked out once per process; None to stay on cf."""
    if not _KEYS:
        _KEYS.append(derive_keys())
    return _KEYS[0]


def derive_keys() -> tuple[str, str] | None:
    token, account = os.environ.get('CLOUDFLARE_API_TOKEN'), os.environ.get('CLOUDFLARE_ACCOUNT_ID')
    if not token or not account:
        return None
    # An account-owned token verifies under the account, a user token under the user.
    for path in (f'accounts/{account}/tokens/verify', 'user/tokens/verify'):
        request = urllib.request.Request(f'https://api.cloudflare.com/client/v4/{path}',
                                         headers={'Authorization': f'Bearer {token}'})
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                token_id = json.load(response).get('result', {}).get('id')
        except (urllib.error.URLError, http.client.HTTPException, ConnectionError, TimeoutError, ValueError):
            continue
        if token_id:
            return token_id, hashlib.sha256(token.encode()).hexdigest()
    print('R2 S3 credentials not found; reading through cf', file=sys.stderr, flush=True)
    return None


def s3_get(command: list[str], keys: tuple[str, str], key: str, bucket: str, stdout: IO[bytes] | int | None, quiet: bool) -> subprocess.CompletedProcess:
    """GET one object through R2's S3-compatible API (AWS Signature V4, region auto), shaped like cf's result.
    A missing object raises with "does not exist" on stderr, as cf does; 5xx and 429 are retried."""
    account = os.environ['CLOUDFLARE_ACCOUNT_ID']
    host = f'{account}.r2.cloudflarestorage.com'
    path = '/' + urllib.parse.quote(f'{bucket}/{key}', safe='/-_.~')
    for wait in (*WAITS, None):
        request = urllib.request.Request(f'https://{host}{path}', headers=signed_headers(host, path, keys))
        status, body = None, bytearray()
        try:
            with urllib.request.urlopen(request, timeout=300) as response:
                length = response.headers.get('Content-Length')
                received = 0
                while chunk := response.read(1 << 20):
                    received += len(chunk)
                    # A write to the file fails on its own (not retried); only the network is retried.
                    if stdout is None:
                        body += chunk
                    elif stdout != subprocess.DEVNULL:
                        stdout.write(chunk)
                if length is not None and received != int(length):
                    raise http.client.IncompleteRead(b'', int(length) - received)
            if stdout is None:
                return subprocess.CompletedProcess(command, 0, bytes(body), b'')
            if stdout != subprocess.DEVNULL:
                stdout.flush()
            return subprocess.CompletedProcess(command, 0, None, b'')
        except (urllib.error.URLError, http.client.HTTPException, ConnectionError, TimeoutError) as error:
            status = getattr(error, 'code', None)
            if status == 404:
                stderr = f'The specified object does not exist: {bucket}/{key}\n'.encode()
            else:
                stderr = f'R2 S3 GET failed ({status or error!r}): {bucket}/{key}\n'.encode()
            if wait is None or (status is not None and status != 429 and status < 500):
                if not quiet:
                    print(stderr.decode(), end='', file=sys.stderr, flush=True)
                raise subprocess.CalledProcessError(1, command, None, stderr) from error
            print(f'R2 S3 GET failed ({status or error!r}); retrying in {wait}s: {key}', file=sys.stderr, flush=True)
            time.sleep(wait)
            if hasattr(stdout, 'truncate'):
                stdout.seek(0)
                stdout.truncate()
    raise AssertionError('unreachable')


def signed_headers(host: str, path: str, keys: tuple[str, str]) -> dict[str, str]:
    """The headers of an unsigned-payload GET signed with AWS Signature V4 for R2 (region auto, service s3)."""
    now = datetime.datetime.now(datetime.timezone.utc)
    stamp, day = now.strftime('%Y%m%dT%H%M%SZ'), now.strftime('%Y%m%d')
    payload = 'UNSIGNED-PAYLOAD'
    signed = 'host;x-amz-content-sha256;x-amz-date'
    canonical = f'GET\n{path}\n\nhost:{host}\nx-amz-content-sha256:{payload}\nx-amz-date:{stamp}\n\n{signed}\n{payload}'
    scope = f'{day}/auto/s3/aws4_request'
    to_sign = f'AWS4-HMAC-SHA256\n{stamp}\n{scope}\n{hashlib.sha256(canonical.encode()).hexdigest()}'
    key = ('AWS4' + keys[1]).encode()
    for part in (day, 'auto', 's3', 'aws4_request'):
        key = hmac.new(key, part.encode(), hashlib.sha256).digest()
    signature = hmac.new(key, to_sign.encode(), hashlib.sha256).hexdigest()
    return {
        'x-amz-date': stamp,
        'x-amz-content-sha256': payload,
        'Authorization': f'AWS4-HMAC-SHA256 Credential={keys[0]}/{scope}, '
                         f'SignedHeaders={signed}, Signature={signature}',
    }
