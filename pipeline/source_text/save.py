"""保存済みの出典 PDF から頁ごとの文字を抜き出し、非公開 R2 の `source-text/<sha256>.json` に置く。

web のアシスタントが apps/api の内部 RPC（`SourcePages`）から、出典の1頁を読むために使う（docs/prd/source-reading/dd.md）。
対象は出典の選定（`selections`・`evaluation_selections`・`press_selections`）で R2 に保存済みの、文字の層がある PDF
（`pdf_type: text`）と、事業の取り込みの宣言（`ingestion/project/origins.json` の `results`）の出典。
既定は計画の表示だけで、`--write` で R2 へ書く。R2 に同じ key があれば作り直さない（key は出典の sha256 で、中身は出典から決まる）。
抜き出し方を変えたときは `--refresh` で保存済みの key も作り直す。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

from source_text.layout import page_texts


PIPELINE = Path(__file__).resolve().parents[1]
SELECTION_DIR = PIPELINE / 'source_selection'
PROJECT_ORIGINS = PIPELINE / 'ingestion/project/origins.json'
CACHE = PIPELINE / '.cache/source-text'
BUCKET = 'fudoki-inputs'
PREFIX = 'source-text/'
SCHEMA_VERSION = 2


@dataclass(frozen=True)
class Origin:
    """頁の文字を作る出典 1 ファイル。"""

    sha256: str
    r2_key: str
    jurisdiction: str
    fiscal_year: int
    kind: str  # selections の document_kind、評価資料は evaluation、予算案のプレス発表は press


KINDS = {'evaluation_selections': 'evaluation', 'press_selections': 'press'}


def object_key(sha256: str) -> str:
    return f'{PREFIX}{sha256}.json'


def load_origins(selection_dir: Path = SELECTION_DIR) -> list[Origin]:
    """保存の記録がある、文字の層を持つ PDF の出典を返す。同じ sha256 は1つにまとめる（会計・方向で同じファイルを共有する）。"""
    origins: dict[str, Origin] = {}
    for path in sorted(selection_dir.glob('[0-9]*.json')):
        document = json.loads(path.read_text(encoding='utf-8'))
        for field in ('selections', 'evaluation_selections', 'press_selections'):
            for selection in document.get(field) or []:
                archive = selection.get('archive')
                if not archive or selection.get('selected_candidate_id') is None:
                    continue
                candidate = next(c for c in selection['candidates'] if c['id'] == selection['selected_candidate_id'])
                saved = {f['sha256']: f for f in archive['files']}
                target = selection['target']
                for file in candidate['files']:
                    if file.get('format') != 'pdf' or file.get('pdf_type') != 'text' or file['sha256'] not in saved:
                        continue
                    origins.setdefault(file['sha256'], Origin(
                        sha256=file['sha256'], r2_key=saved[file['sha256']]['key'], jurisdiction=target['jurisdiction'],
                        fiscal_year=target['fiscal_year'],
                        kind=KINDS.get(field) or target['document_kind']))
    origins.update({o.sha256: o for o in project_origins() if o.sha256 not in origins})
    return sorted(origins.values(), key=lambda o: (o.jurisdiction, o.fiscal_year, o.kind, o.sha256))


def project_origins(path: Path = PROJECT_ORIGINS) -> list[Origin]:
    """事業の取り込みが R2 の `project/` に保存した評価結果の PDF（プレス発表は出典の選定の `press_selections` から読む）。"""
    from ingestion.project.run import object_key as project_key

    declared = json.loads(path.read_text(encoding='utf-8'))
    return [Origin(sha256=origin['sha256'], r2_key=project_key(field, origin), jurisdiction=origin['jurisdiction'],
                   fiscal_year=origin.get('budget_year', origin.get('fiscal_year')), kind=kind)
            for field, kind in (('results', 'evaluation'),) for origin in declared.get(field) or []]


def render(sha256: str, texts: list[str]) -> bytes:
    """R2 に置く本文。pages[i] は物理頁 i+1 の文字（文字の無い頁は空文字）。"""
    return json.dumps({'schema_version': SCHEMA_VERSION, 'sha256': sha256, 'pages': texts},
                      ensure_ascii=False, separators=(',', ':')).encode('utf-8')


def cf(*args: str, capture: bool = False) -> str:
    last = ''
    for attempt in range(3):
        result = subprocess.run(['cf', 'r2', 'objects', *args, '--bucket-name', BUCKET, '--quiet'],
                                capture_output=True, text=True)
        if result.returncode == 0:
            return result.stdout if capture else ''
        last = result.stderr.strip()[-500:]
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f'cf r2 objects {args[0]} が失敗: {last}')


def saved_keys() -> set[str]:
    keys: set[str] = set()
    after: str | None = None
    while True:
        args = ['list', '--prefix', PREFIX, '--per-page', '1000'] + (['--start-after', after] if after else [])
        page = json.loads(cf(*args, capture=True))
        current = sorted(item['key'] for item in page)
        keys.update(current)
        if len(current) < 1000:
            return keys
        after = current[-1]


def fetch(origin: Origin) -> Path:
    """R2 の出典を cache に置き、sha256 を選定と照らす。取得の失敗と途中で切れた取得（sha256 の不一致）は3回まで取り直す。"""
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f'{origin.sha256}.pdf'
    if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == origin.sha256:
        return path
    last = ''
    for attempt in range(3):
        with tempfile.NamedTemporaryFile(dir=CACHE, delete=False) as stream:
            temporary = Path(stream.name)
            result = subprocess.run(['cf', 'r2', 'objects', 'get', origin.r2_key, '--bucket-name', BUCKET, '--quiet'],
                                    stdout=stream, stderr=subprocess.PIPE, text=False)
        if result.returncode == 0 and hashlib.sha256(temporary.read_bytes()).hexdigest() == origin.sha256:
            temporary.replace(path)
            return path
        temporary.unlink(missing_ok=True)
        last = 'sha256 が選定と違う' if result.returncode == 0 else result.stderr.decode(errors='replace').strip()[-300:]
        if attempt < 2:
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f'R2 の出典を取れない: {origin.r2_key}: {last}')


def put(key: str, body: bytes) -> None:
    with tempfile.NamedTemporaryFile(suffix='.json') as stream:
        stream.write(body)
        stream.flush()
        cf('put', key, '--file', stream.name, '--content-type', 'application/json; charset=utf-8')


def save_one(origin: Origin, keep_cache: bool) -> tuple[int, int]:
    """1つの出典を取り、頁の文字を R2 に置く。頁数と文字の無い頁の数を返す。"""
    path = fetch(origin)
    try:
        texts = page_texts(path)
        put(object_key(origin.sha256), render(origin.sha256, texts))
    finally:
        if not keep_cache:
            path.unlink(missing_ok=True)
    return len(texts), sum(1 for t in texts if not t)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--write', action='store_true', help='R2 へ書く（既定は計画の表示だけ）')
    parser.add_argument('--jurisdiction', help='自治体コード（6桁）で絞る')
    parser.add_argument('--kind', choices=['initial', 'settlement', 'supplementary', 'evaluation', 'press'], help='資料の種類で絞る')
    parser.add_argument('--refresh', action='store_true', help='R2 にある key も作り直す（抜き出し方を変えたとき）')
    parser.add_argument('--jobs', type=int, default=4, help='同時に処理する出典の数')
    parser.add_argument('--keep-cache', action='store_true', help='取った出典 PDF を cache に残す（既定は1件ごとに消す）')
    args = parser.parse_args(argv)
    origins = [o for o in load_origins()
               if (not args.jurisdiction or o.jurisdiction == args.jurisdiction) and (not args.kind or o.kind == args.kind)]
    existing = set() if args.refresh else saved_keys()
    todo = [o for o in origins if object_key(o.sha256) not in existing]
    print(json.dumps({'mode': 'write' if args.write else 'plan', 'origins': len(origins),
                      'saved': len(origins) - len(todo), 'to_write': len(todo)}, ensure_ascii=False), flush=True)
    if not args.write:
        return 0
    from ingestion.lib import poppler

    poppler.require()  # 語は Poppler の版で変わる（ingestion/lib/poppler.py）
    failed = 0
    with ProcessPoolExecutor(max_workers=args.jobs) as pool:
        futures = {pool.submit(save_one, origin, args.keep_cache): origin for origin in todo}
        for number, future in enumerate(as_completed(futures), 1):
            origin = futures[future]
            try:
                pages, empty = future.result()
            except Exception as error:  # 1件の失敗で残りを止めない。次の実行が未保存の分だけを取り直す
                failed += 1
                print(f'[{number}/{len(todo)}] 失敗 {origin.r2_key}: {error}', flush=True)
                continue
            print(f'[{number}/{len(todo)}] {origin.jurisdiction} {origin.fiscal_year} {origin.kind} {origin.sha256[:12]} '
                  f'{pages}頁（文字の無い頁 {empty}）', flush=True)
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
