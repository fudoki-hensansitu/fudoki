"""市町村の決算の指標（総務省「市町村別決算状況調」）を読み、web の D1（fudoki-web）の local_finance を全行入れ替える。

    bun run --cwd apps/web sync-data:local-finance             # 入れる行の数を見るだけ（D1 に書かない）
    bun run --cwd apps/web sync-data:local-finance --write     # 本番と preview の D1 に書く（cf と Cloudflare のトークンが要る）

出典は総務省「市町村別決算状況調」（普通会計、https://www.soumu.go.jp/iken/kessan_jokyo_2.html）の
(1)概況・(4)性質別歳出内訳・(5)地方債現在高等の Excel で、都市別と町村別（東京の特別区を含む）を読む。都道府県は載っていない。
Queria に決算状況調が入るまでの仮の取得で、入ったら population.py と同じく Queria から読む形に差し替える。
毎年度の公表（翌々年の春）のあと、FILES に年度を足して1回流す。表は migrations/0003_local_finance.sql（deploy-web が当てる）。
"""
from __future__ import annotations

import argparse
import json
import re
import tempfile
import urllib.request
from pathlib import Path

import duckdb
from population import DATABASES, ROWS_PER_STATEMENT, write

# 年度（西暦）ごとの Excel の番号（soumu.go.jp/main_content/<番号>.xlsx）。(1)概況・(4)性質別・(5)地方債現在高等の順
FILES: dict[int, dict[str, tuple[str, str, str]]] = {
    2020: {'city': ('000800819', '000800823', '000800825'), 'town': ('000800826', '000800832', '000800834')},
    2021: {'city': ('000871018', '000871021', '000871022'), 'town': ('000871023', '000871026', '000871027')},
    2022: {'city': ('000937287', '000937290', '000937291'), 'town': ('000937292', '000937295', '000937296')},
    2023: {'city': ('000999900', '000999903', '000999904'), 'town': ('000999905', '000999910', '000999911')},
    2024: {'city': ('001061669', '001061672', '001061673'), 'town': ('001061674', '001061677', '001061678')},
}

# 列ごとに、見出し（上の8行をつないだもの）に含まれる語（= で始まるものは見出しと一致）。どれも1列にだけ当たることを確かめる。
# 金額は千円で載るので円にする。比率は %、財政力指数は指数のまま
COLUMNS: dict[int, dict[str, tuple[tuple[str, ...], str]]] = {
    0: {
        'expenditure_total_yen': (('歳出総額',), 'yen'),
        'standard_fiscal_scale_yen': (('標準財政規模',), 'yen'),
        'real_balance_yen': (('実質収支(C)-(D)',), 'yen'),
        'real_balance_ratio': (('実質収支比率',), 'ratio'),
        'current_balance_ratio': (('=経常収支比率/(%)',), 'ratio'),
        'fiscal_capability_index': (('財政力指数',), 'ratio'),
        'real_deficit_ratio': (('健全化判断比率/実質赤字比率',), 'ratio'),
        'consolidated_real_deficit_ratio': (('連結実質赤字比率',), 'ratio'),
        'real_debt_service_ratio': (('実質公債費比率',), 'ratio'),
        'future_burden_ratio': (('将来負担比率',), 'ratio'),
    },
    1: {
        'personnel_yen': (('一/人件費',), 'yen'),
        'social_assistance_yen': (('四/扶助費',), 'yen'),
        'debt_service_yen': (('九/公債費',), 'yen'),
    },
    2: {
        'local_bond_balance_yen': (('地方債現在高',), 'yen'),
        'fund_balance_yen': (('=積立金現在高',), 'yen'),
        'fiscal_adjustment_fund_yen': (('財政調整基金',), 'yen'),
        'debt_reduction_fund_yen': (('減債基金',), 'yen'),
        'specified_purpose_fund_yen': (('その他特定目的基金',), 'yen'),
    },
}
NAMES = [name for kind in COLUMNS.values() for name in kind]
# 見出しの行（0 始まり）と、値が始まる前の行の数
HEADER_ROWS = range(7, 15)


def download(number: str, folder: Path) -> Path:
    path = folder / f'{number}.xlsx'
    request = urllib.request.Request(f'https://www.soumu.go.jp/main_content/{number}.xlsx', headers={'User-Agent': 'fudoki-sync-data'})
    with urllib.request.urlopen(request, timeout=120) as response:
        path.write_bytes(response.read())
    return path


def sheet(con: duckdb.DuckDBPyConnection, path: Path) -> list[tuple]:
    return con.execute(f"select * from read_xlsx('{path}', header=false, all_varchar=true, range='A1:FZ3000', stop_at_empty=false)").fetchall()


def header(rows: list[tuple], column: int) -> str:
    return '/'.join(str(rows[i][column]).replace('\n', '').replace('　', '') for i in HEADER_ROWS if rows[i][column] not in (None, ''))


def value(text: str | None, kind: str) -> float | int | None:
    """'-'・空欄は数字の無い印（赤字が無いときの実質赤字比率など）なので null にする"""
    if text is None or text.strip() in ('', '-', '－', '―', '…', '*'):
        return None
    number = float(text.replace(',', ''))
    return round(number * 1000) if kind == 'yen' else number


def read_file(con: duckdb.DuckDBPyConnection, path: Path, columns: dict[str, tuple[tuple[str, ...], str]]) -> dict[str, dict[str, object]]:
    rows = sheet(con, path)
    width = max(len(r) for r in rows)
    headers = [header(rows, j) for j in range(width)]
    code_column = next(j for j, h in enumerate(headers) if '団体コード' in h)
    found: dict[str, int] = {}
    for name, (words, _) in columns.items():
        hits = [j for j, h in enumerate(headers) if all(h == w[1:] if w.startswith('=') else w in h for w in words)]
        if len(hits) != 1:
            raise ValueError(f'{path.name}: {name} の列が {len(hits)} 列に当たりました（{words}）')
        found[name] = hits[0]
    out: dict[str, dict[str, object]] = {}
    for r in rows[HEADER_ROWS.stop:]:
        code = (r[code_column] or '').strip()
        if not re.fullmatch(r'\d{6}', code):
            continue
        out[code] = {name: value(r[j], columns[name][1]) for name, j in found.items()}
    return out


def read() -> list[tuple]:
    rows: list[tuple] = []
    with duckdb.connect() as con, tempfile.TemporaryDirectory() as tmp:
        con.execute('install excel')
        con.execute('load excel')
        for year, groups in FILES.items():
            merged: dict[str, dict[str, object]] = {}
            for numbers in groups.values():
                parts = [read_file(con, download(n, Path(tmp)), COLUMNS[i]) for i, n in enumerate(numbers)]
                if not (parts[0].keys() == parts[1].keys() == parts[2].keys()):
                    raise ValueError(f'{year}: 3つのファイルの団体が揃っていません')
                for code in parts[0]:
                    merged[code] = {**parts[0][code], **parts[1][code], **parts[2][code]}
            rows += [(code, year, *(merged[code][n] for n in NAMES)) for code in sorted(merged)]
    check(rows)
    return rows


def check(rows: list[tuple]) -> None:
    """列がずれた・団体が欠けたまま入れないよう、形と数を確かめる"""
    for year in FILES:
        got = [r for r in rows if r[1] == year]
        # 市区町村は約1,740。大きく減っていたら読み違い
        if len(got) < 1700:
            raise ValueError(f'{year} の団体が {len(got)} しかありません')
        for r in got:
            item = dict(zip(NAMES, r[2:]))
            if not item['expenditure_total_yen'] or item['expenditure_total_yen'] <= 0:
                raise ValueError(f'{year} {r[0]}: 歳出総額がありません')
            parts = sum(item[k] or 0 for k in ('personnel_yen', 'social_assistance_yen', 'debt_service_yen'))
            if parts > item['expenditure_total_yen']:
                raise ValueError(f'{year} {r[0]}: 人件費・扶助費・公債費の和が歳出総額を超えます')
            funds = sum(item[k] or 0 for k in ('fiscal_adjustment_fund_yen', 'debt_reduction_fund_yen', 'specified_purpose_fund_yen'))
            if abs(funds - (item['fund_balance_yen'] or 0)) > 1000 * 3:
                raise ValueError(f'{year} {r[0]}: 基金の内訳の和が積立金現在高と合いません')


def sql_value(v: object) -> str:
    return 'NULL' if v is None else str(v)


def statements(rows: list[tuple]) -> list[dict]:
    out = [{'sql': 'delete from local_finance'}]
    columns = ', '.join(['jurisdiction_code', 'fiscal_year', *NAMES])
    for i in range(0, len(rows), ROWS_PER_STATEMENT):
        values = ', '.join(f"('{r[0]}', {r[1]}, {', '.join(sql_value(v) for v in r[2:])})" for r in rows[i:i + ROWS_PER_STATEMENT])
        out.append({'sql': f'insert into local_finance ({columns}) values {values}'})
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--write', action='store_true', help='本番と preview の D1 に書く')
    parser.add_argument('--only', choices=sorted(DATABASES), help='--write で片方の D1 にだけ書く')
    args = parser.parse_args()
    rows = read()
    print(json.dumps({'rows': len(rows), 'fiscal_years': sorted({r[1] for r in rows}), 'jurisdictions': len({r[0] for r in rows})}, ensure_ascii=False))
    if args.write:
        for name, database_id in DATABASES.items():
            if args.only in (None, name):
                write(database_id, statements(rows))
                print(f'written {name}')


if __name__ == '__main__':
    main()
