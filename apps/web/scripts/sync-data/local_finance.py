"""市町村の決算の指標（総務省「市町村別決算状況調」）を Queria から読み、web の D1（fudoki-web）の local_finance を全行入れ替える。

    bun run --cwd apps/web sync-data:local-finance             # 入れる行の数を見るだけ（D1 に書かない）
    bun run --cwd apps/web sync-data:local-finance --write     # 本番と preview の D1 に書く（cf と Cloudflare のトークンが要る）

出典は総務省「市町村別決算状況調」（普通会計、https://www.soumu.go.jp/iken/kessan_jokyo_2.html）の
(1)概況・(4)性質別歳出内訳・(5)地方債現在高等で、都市と町村（東京の特別区を含む）を読む。都道府県は載っていない。
Queria の `soumu.local_finance.municipal_settlement`（Excel のセルを1行ずつ持つ縦持ちの表）を DuckDB で ATTACH して読む
（data.queria.io、ログイン不要）。縦持ちを読むのは、出典の「-」を値と別に持つから（横持ちの表では NULL になる）。
毎年度の公表（翌々年の春）のあと、Queria に入ったら1回流す。表は migrations/0003_local_finance.sql（deploy-web が当てる）。
"""
from __future__ import annotations

import argparse
import json

import duckdb
from population import DATABASES, write

CATALOG = 'ducklake:https://data.queria.io/soumu/ducklake.duckdb'
# 入れる決算年度の下限
SINCE = 2020

# 列ごとに、決算状況調の表（section）と項目（item、見出しを親から「/」でつないだ名前）と読み方。
# 金額は千円で載るので円にする（yen_na は「-」を0ではなく該当なしと読む）。比率は %、財政力指数は指数のまま
COLUMNS: dict[str, tuple[str, str, str]] = {
    'expenditure_total_yen': ('概況', '歳出総額', 'yen'),
    'standard_fiscal_scale_yen': ('概況', '標準財政規模', 'yen_na'),
    'real_balance_yen': ('概況', '実質収支', 'yen'),
    'real_balance_ratio': ('概況', '実質収支比率', 'ratio'),
    'current_balance_ratio': ('概況', '経常収支比率', 'ratio'),
    'fiscal_capability_index': ('概況', '財政力指数', 'ratio'),
    'real_deficit_ratio': ('概況', '健全化判断比率/実質赤字比率', 'ratio'),
    'consolidated_real_deficit_ratio': ('概況', '健全化判断比率/連結実質赤字比率', 'ratio'),
    'real_debt_service_ratio': ('概況', '健全化判断比率/実質公債費比率', 'ratio'),
    'future_burden_ratio': ('概況', '健全化判断比率/将来負担比率', 'ratio'),
    'personnel_yen': ('性質別歳出内訳', '人件費', 'yen'),
    'social_assistance_yen': ('性質別歳出内訳', '扶助費', 'yen'),
    'debt_service_yen': ('性質別歳出内訳', '公債費', 'yen'),
    'local_bond_balance_yen': ('地方債現在高等', '地方債現在高', 'yen'),
    'fund_balance_yen': ('地方債現在高等', '積立金現在高', 'yen'),
    'fiscal_adjustment_fund_yen': ('地方債現在高等', '積立金現在高/財政調整基金', 'yen'),
    'debt_reduction_fund_yen': ('地方債現在高等', '積立金現在高/減債基金', 'yen'),
    'specified_purpose_fund_yen': ('地方債現在高等', '積立金現在高/その他特定目的基金', 'yen'),
}
NAMES = list(COLUMNS)
# 1つの insert 文に載せる行の数。20列あるので、D1 の1文の上限（100KB）に余裕を持たせる
ROWS_PER_STATEMENT = 200

QUERY = f"""
select lg_code, fiscal_year, section, item, unit, value, value_text
from soumu.local_finance.municipal_settlement
where fiscal_year >= {SINCE}
  and lg_code is not null
  and (section, item) in ({', '.join(f"('{s}', '{i}')" for s, i, _ in COLUMNS.values())})
"""


def value(number: float | None, text: str | None, unit: str | None, kind: str) -> float | int | None:
    """「-」は、金額なら0（減債基金が無いなど）、比率と標準財政規模なら該当なし（赤字が無い、特別区など）で null にする"""
    if kind in ('yen', 'yen_na') and unit != '千円':
        raise ValueError(f'金額の単位が千円ではありません: {unit}')
    if number is None:
        if text is None or text.strip() == '':
            return None
        if text.strip() in ('-', '－', '―'):
            return 0 if kind == 'yen' else None
        raise ValueError(f'数でない値です: {text}')
    # 比率は Excel の浮動小数（78.099999…）を出典の桁に丸める
    return round(number * 1000) if kind in ('yen', 'yen_na') else round(number, 3)


def read() -> list[tuple]:
    with duckdb.connect() as con:
        con.execute('install ducklake')
        con.execute('load ducklake')
        con.execute(f"attach '{CATALOG}' as soumu (read_only)")
        cells = con.execute(QUERY).fetchall()
    by_item = {(s, i): name for name, (s, i, _) in COLUMNS.items()}
    merged: dict[tuple[str, int], dict[str, object]] = {}
    for code, year, section, item, unit, number, text in cells:
        name = by_item[(section, item)]
        row = merged.setdefault((code, year), {})
        if name in row:
            raise ValueError(f'{year} {code}: {name} が2つあります')
        row[name] = value(number, text, unit, COLUMNS[name][2])
    for (code, year), row in merged.items():
        if missing := [n for n in NAMES if n not in row]:
            raise ValueError(f'{year} {code}: {missing} がありません')
    rows = [(code, year, *(merged[(code, year)][n] for n in NAMES)) for code, year in sorted(merged)]
    check(rows)
    return rows


def check(rows: list[tuple]) -> None:
    """列がずれた・団体が欠けたまま入れないよう、形と数を確かめる"""
    for year in sorted({r[1] for r in rows}):
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
