"""住民基本台帳人口（総務省の市区町村別・総計の xlsx）を取得して R2 に保存し、入力準備のために読む。

    bun run --cwd pipeline population:save   # 宣言の URL から取得し、R2 に保存する（ネットワークを使う。CI では回さない）

ハッシュは持たない。資料はほとんど変わらないので、保存後の照合はしない（2026-11-06 の判断）。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import tempfile
import urllib.request
from pathlib import Path

import duckdb

from ingestion.fiscal.manifest import BUCKET
from ingestion.paths import CACHE

ORIGINS = Path(__file__).with_name('origins.json')
OBJECTS = CACHE / 'objects'
# 見出しの行（「人口」の下の段）。この並びでなければ様式が変わったので止める
MAX_ROWS = 10000
HEADER = ('男', '女', '計', '世帯数')


def origins() -> list[dict]:
    return json.loads(ORIGINS.read_text(encoding='utf-8'))['origins']


def origin_id(origin: dict) -> str:
    """資料の識別子。中身由来（ADR 0005）で、ハッシュを持たないので URL から作る。"""
    return hashlib.sha256(origin['url'].encode()).hexdigest()[:16]


def object_key(origin: dict) -> str:
    """R2 とキャッシュの key。URL を直したら別の key になり、古い資料を新しい URL のものとして読まない。"""
    return f'population/resident-register/{origin["reference_date"]}/{origin_id(origin)}.xlsx'


def fetch(origin: dict, *, remote: bool = False) -> Path:
    """キャッシュの xlsx。無ければ `remote` のときだけ R2 から戻す。"""
    path = OBJECTS / object_key(origin)
    if path.exists():
        return path
    if not remote:
        raise FileNotFoundError(f'Population origin is not cached; run with --remote: {object_key(origin)}')
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
    try:
        with temporary.open('wb') as stream:
            subprocess.run(['cf', 'r2', 'objects', 'get', object_key(origin), '--bucket-name', BUCKET, '--quiet'],
                           stdout=stream, check=True)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
    return path


def save(origin: dict) -> Path:
    """宣言の URL から取得してキャッシュに置き、R2 の固定 key に保存する。"""
    path = OBJECTS / object_key(origin)
    path.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(origin['url'], timeout=60) as response:
        data = response.read()
    temporary = path.with_suffix('.download')
    temporary.write_bytes(data)
    try:
        # 様式が違う・エラーの頁が返ったときは、読めずにここで止まり、キャッシュも R2 も上書きしない
        with duckdb.connect() as con:
            read(con, temporary, origin['reference_date'])
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
    subprocess.run(['cf', 'r2', 'objects', 'put', object_key(origin), '--bucket-name', BUCKET,
                    '--file', str(path), '--quiet'], check=True, stdout=subprocess.DEVNULL)
    return path


def printed_date(reference_date: str) -> str:
    """基準日を表題の印字（「令和8年1月1日」）に直す。令和より前の資料は扱わない。"""
    year, month, day = (int(part) for part in reference_date.split('-'))
    if year < 2020:
        raise ValueError(f'Reference date before Reiwa 2 is not supported: {reference_date}')
    return f'令和{year - 2018}年{month}月{day}日'


def parse(rows: list[tuple], reference_date: str) -> list[tuple[str, int, int, int, int]]:
    """xlsx の行（文字列）から (自治体コード, 男, 女, 計, 世帯数)。合計の行（コード「-」）と注記は読まない。

    宣言の URL と基準日を取り違えないよう、表題に印字された基準日を宣言と突き合わせる。
    """
    title = rows[0][0] if rows and rows[0] else None
    if not title or not title.startswith(printed_date(reference_date) + '住民基本台帳'):
        raise ValueError(f'Resident register title does not match {reference_date}: {title}')
    start = next((i for i, row in enumerate(rows) if row and row[0] == '団体コード'), None)
    if start is None or start < 2 or tuple(rows[start - 1][3:7]) != HEADER:
        raise ValueError('Unexpected resident register layout: header row not found')
    out, seen = [], set()
    for row in rows[start + 1:]:
        code = row[0] if row else None
        if not code or not (len(code) == 6 and code.isdigit()):
            continue
        if code in seen:
            raise ValueError(f'Duplicate jurisdiction code: {code}')
        seen.add(code)
        out.append((code, *(int(value) for value in row[3:7])))
    if not out:
        raise ValueError('Resident register has no rows')
    return out


def read(con, path: Path, reference_date: str) -> list[tuple[str, int, int, int, int]]:
    con.execute('install excel')
    con.execute('load excel')
    # 範囲を開けると空の行まで100万行読むので上限を置き、上限の行まで埋まっていたら切れたとみなして止める
    rows = con.execute(f"select * from read_xlsx(?, header = false, all_varchar = true, range = 'A1:G{MAX_ROWS}')",
                       [str(path)]).fetchall()
    if len(rows) >= MAX_ROWS and any(rows[-1]):
        raise ValueError(f'Resident register may exceed {MAX_ROWS} rows; raise MAX_ROWS')
    return parse(rows, reference_date)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('command', choices=['save'])
    parser.parse_args()
    for origin in origins():
        print(object_key(origin), save(origin).stat().st_size)


if __name__ == '__main__':
    main()
