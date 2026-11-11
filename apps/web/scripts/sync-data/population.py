"""住民基本台帳人口を Queria から読み、web の D1（fudoki-web）の population を全行入れ替える。

    bun run --cwd apps/web sync-data:population             # 入れる行の数を見るだけ（D1 に書かない）
    bun run --cwd apps/web sync-data:population --write     # 本番と preview の D1 に書く（cf と Cloudflare のトークンが要る）

出典は総務省「住民基本台帳に基づく人口、人口動態及び世帯数」の総計。Queria の
`e_stat.resident_registry.population` を DuckDB で ATTACH して読む（data.queria.io、ログイン不要）。
住基は毎年1月1日時点で7月末に公表されるので、公表のあとに1回流す。表は migrations/0002_population.sql（deploy-web が当てる）。
外部のデータを足すときは、同じく scripts/sync-data/<名前>.py と `sync-data:<名前>` にする。
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import tempfile
from pathlib import Path

import duckdb

# 本番の fudoki-web と preview の fudoki-web-preview（void.config.ts と同じ）。両方に同じ行を入れる
DATABASES = {'production': '760c7476-6e46-4b44-b174-1bfdd1b4f957', 'preview': '5b2c16b3-f008-4901-8660-2c66db3c714d'}
CATALOG = 'ducklake:https://data.queria.io/e_stat/ducklake.duckdb'
# 入れる基準日の下限
SINCE = '2025-01-01'
# 1つの insert 文に載せる行の数
ROWS_PER_STATEMENT = 500
CF = Path(__file__).resolve().parents[2] / 'node_modules' / '.bin' / 'cf'

QUERY = f"""
select lg_code, strftime(reference_date, '%Y-%m-%d'), population_male, population_female, population_total, households
from e_stat.resident_registry.population
where resident_kind = 'total'
  and area_level in ('prefecture', 'municipality')
  and lg_code is not null
  and reference_date >= date '{SINCE}'
order by lg_code, reference_date
"""


def read() -> list[tuple[str, str, int, int, int, int]]:
    with duckdb.connect() as con:
        con.execute('install ducklake')
        con.execute('load ducklake')
        con.execute(f"attach '{CATALOG}' as e_stat (read_only)")
        rows = con.execute(QUERY).fetchall()
    check(rows)
    return rows


def check(rows: list[tuple]) -> None:
    """列の意味が変わった・行が欠けたまま入れないよう、形と数を確かめる。Queria は表の形を予告なく変えることがある。"""
    if not rows:
        raise ValueError('Queria から人口の行が1つも読めませんでした')
    seen = set()
    for code, date, male, female, total, households in rows:
        if not re.fullmatch(r'\d{6}', code) or not re.fullmatch(r'\d{4}-01-01', date):
            raise ValueError(f'自治体コードか基準日の形が違います: {code} {date}')
        if (code, date) in seen:
            raise ValueError(f'同じ自治体・基準日が2行あります: {code} {date}')
        seen.add((code, date))
        if None in (male, female, total, households) or total < male + female or households < 0:
            raise ValueError(f'人数が合いません: {code} {date}')
    # 途中で切れた結果を入れないよう、基準日ごとに47都道府県（コードの3〜5桁目が 000）が揃うことを確かめる
    for date in sorted({d for _, d, *_ in rows}):
        if len({c for c, d, *_ in rows if d == date and c[2:5] == '000'}) != 47:
            raise ValueError(f'{date} の都道府県が47揃っていません')


def statements(rows: list[tuple]) -> list[dict]:
    out = [{'sql': 'delete from population'}]
    for i in range(0, len(rows), ROWS_PER_STATEMENT):
        values = ', '.join(f"('{c}', '{d}', {m}, {f}, {t}, {h})" for c, d, m, f, t, h in rows[i:i + ROWS_PER_STATEMENT])
        out.append({'sql': f'insert into population (jurisdiction_code, reference_date, male, female, population, households) values {values}'})
    return out


def write(database_id: str, batch: list[dict]) -> None:
    """delete と insert を1回の batch（1つのトランザクション）で流す。途中で失敗したら前の行が残る。"""
    with tempfile.NamedTemporaryFile('w', suffix='.json', encoding='utf-8') as file:
        json.dump(batch, file)
        file.flush()
        result = subprocess.run([str(CF), 'd1', 'raw', database_id, '--batch', f'@{file.name}'],
                                capture_output=True, text=True, check=True)
    results = json.loads(result.stdout)
    if len(results) != len(batch) or not all(r.get('success') for r in results):
        raise RuntimeError(f'cf d1 raw の結果が不正です: {result.stdout[:2000]}')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--write', action='store_true', help='本番と preview の D1 に書く')
    parser.add_argument('--only', choices=sorted(DATABASES), help='--write で片方の D1 にだけ書く（表を足した PR を merge する前に preview で確かめるときなど）')
    args = parser.parse_args()
    rows = read()
    dates = sorted({d for _, d, *_ in rows})
    print(json.dumps({'rows': len(rows), 'reference_dates': dates, 'jurisdictions': len({c for c, *_ in rows})}, ensure_ascii=False))
    if args.write:
        for name, database_id in DATABASES.items():
            if args.only in (None, name):
                write(database_id, statements(rows))
                print(f'written {name}')


if __name__ == '__main__':
    main()
