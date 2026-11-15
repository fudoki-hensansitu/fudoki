"""文字の層の無い（スキャン）・字形の壊れた評価の冊を OCR で読む。

宣言の `ocr` に依頼（`request`、既定は全頁を Paddle で読み VLM に聞かない）を書くと、その冊は `page_words` の代わりに
OCR の観測の行（Paddle の検出の箱）を語として読む。観測は一度だけ取り、内容の SHA を宣言の `observations` に固定し、
非公開 R2 の `project/ocr/<出典の sha256>.json.gz` に置く（ADR 0019 と同じ考え方）。

    python -m ingestion.project.sheet.ocr 131059          # 未固定の冊を読み、手元に置いて宣言に固定する
    python -m ingestion.project.sheet.ocr 131059 --save   # 固定した観測を R2 に置く
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from ingestion import r2
from ingestion.fiscal.manifest import BUCKET
from ingestion.fiscal.storage import OBJECTS
from ingestion.generic import page_words
from ingestion.lib.ocr_ink import superseded

# 冊を全頁読むので白紙の頁を空の頁として残す
REQUEST = {'engine': 'paddle', 'vlm_fallback': False, 'allow_blank': True}


def key(source_sha256: str, suffix: str = '.json.gz') -> str:
    return f'project/ocr/{source_sha256}{suffix}'


def cached(source_sha256: str) -> Path:
    return OBJECTS / key(source_sha256)


def verify(path: Path, pin: dict) -> bytes:
    data = gzip.decompress(path.read_bytes())
    if len(data) != pin['bytes'] or hashlib.sha256(data).hexdigest() != pin['sha256']:
        raise ValueError(f'OCR の観測の SHA・大きさが宣言と違う: {path}')
    return data


def fetch(source_sha256: str, pin: dict, *, remote: bool = False) -> bytes:
    path = cached(source_sha256)
    if not path.exists():
        if not remote:
            raise FileNotFoundError(f'OCR の観測が手元に無い（--remote で R2 から取る）: {source_sha256}')
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
            temporary = Path(stream.name)
            try:
                r2.objects('get', key(source_sha256), '--bucket-name', BUCKET, '--quiet', stdout=stream)
                verify(temporary, pin)
                os.replace(temporary, path)
            finally:
                temporary.unlink(missing_ok=True)
    return verify(path, pin)


def pages(data: bytes) -> list[page_words.Page]:
    """観測の行の箱（kind region、座標は表示の pt）を語にした頁。見落とした墨の読み直しの領域も含める。"""
    observation = json.loads(data)
    out = []
    for page in observation['pages']:
        width, height = page['displayed_pdf_size_pt']
        # OCR は和文の中黒（・）を欧文の中点（·）で返すので、和文の中黒にそろえる
        gone = superseded(page)  # 読み直しで置き換えた箱は使わない
        words = [page_words.Word(item['raw_text'].replace('·', '・'), *item['bbox_pdf_pt'])
                 for region in page['regions'] for item in region['observations']
                 if item['kind'] == 'region' and item.get('bbox_pdf_pt') and item['raw_text'].strip() and item['id'] not in gone]
        out.append(page_words.Page(page['page_number'], width, height, distinct(words)))
    return out


def distinct(words: list) -> list:
    """OCR が行の一部を重ねて読んだ箱（大きい箱にほぼ収まる小さい箱）を外す。"""
    def area(word) -> float:
        return max(word.x1 - word.x0, 0) * max(word.y1 - word.y0, 0)

    def covered(small, large) -> bool:
        x = min(small.x1, large.x1) - max(small.x0, large.x0)
        y = min(small.y1, large.y1) - max(small.y0, large.y0)
        return x > 0 and y > 0 and x * y >= 0.6 * area(small)

    order = sorted(range(len(words)), key=lambda i: area(words[i]), reverse=True)
    kept: list[int] = []
    for i in order:
        if not any(covered(words[i], words[j]) for j in kept):
            kept.append(i)
    return [words[i] for i in sorted(kept)]


def acquire(path: Path, request: dict) -> tuple[bytes, dict]:
    from ingestion.lib import scan_ocr

    request = {**REQUEST, **request}
    if 'pages' not in request:
        request['pages'] = list(range(1, page_words.page_count(path) + 1))
    return scan_ocr.acquire(path, request)


def main() -> None:
    from ingestion.project import run

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('jurisdiction')
    parser.add_argument('--save', action='store_true', help='固定した観測を R2 に置く')
    args = parser.parse_args()
    origins_path = run.HERE / 'origins.json'
    declared = json.loads(origins_path.read_text(encoding='utf-8'))
    entries = [e for e in declared['sheets'] if e['jurisdiction'] == args.jurisdiction and 'ocr' in e]
    if not entries:
        raise SystemExit(f'{args.jurisdiction}: 宣言に ocr が無い')
    for entry in entries:
        observations = entry['ocr'].setdefault('observations', {})
        for origin in run.sheet_sources([entry]):
            sha = origin['sha256']
            if args.save:
                if sha not in observations:
                    raise SystemExit(f'{origin["fiscal_year"]} {sha[:12]}: 観測が宣言に固定されていない（先に --save なしで読む）')
                fetch(sha, observations[sha])
                subprocess.run(['cf', 'r2', 'objects', 'put', key(sha), '--bucket-name', BUCKET,
                                '--file', str(cached(sha)), '--quiet'], check=True, stdout=subprocess.DEVNULL)
                print(f'{origin["fiscal_year"]} {sha[:12]}: R2 に置いた', file=sys.stderr)
                continue
            if sha in observations:
                # 固定した観測は読み直さない（OCR は同じ出力にならないので、固定を書き換えてしまう）。手元に無ければ R2 から取る
                fetch(sha, observations[sha], remote=True)
                continue
            data, record = acquire(run.fetch(origin['reference'], remote=True), entry['ocr'].get('request', {}))
            path = cached(sha)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(gzip.compress(data, mtime=0))
            path.with_name(f'{sha}.run.json').write_text(json.dumps(record, ensure_ascii=False, indent=1) + '\n')
            observations[sha] = pin = {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
            print(f'{origin["fiscal_year"]} {sha[:12]}: {len(json.loads(data)["pages"])} 頁を読んだ', file=sys.stderr)
            # 1冊ごとに宣言へ書き、途中で止まっても読んだ分を残す。ほかの自治体を並べて読むので、読み直してから足す
            pin_declaration(origins_path, entry, sha, pin)


def pin_declaration(origins_path: Path, entry: dict, sha: str, pin: dict) -> None:
    import fcntl

    with open(OBJECTS.parent / 'project-ocr.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        declared = json.loads(origins_path.read_text(encoding='utf-8'))
        target = next(e for e in declared['sheets'] if e['jurisdiction'] == entry['jurisdiction']
                      and e.get('years') == entry.get('years') and 'ocr' in e)
        target['ocr'].setdefault('observations', {})[sha] = pin
        # 途中で落ちても宣言が壊れないよう、一時ファイルに書いて置き換える
        temporary = origins_path.with_name(f'.{origins_path.name}.tmp')
        temporary.write_text(json.dumps(declared, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        os.replace(temporary, origins_path)


if __name__ == '__main__':
    main()
