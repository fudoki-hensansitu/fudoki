"""予算書・決算書の事業の行を、同じ年度の当初予算と決算、前の年度とで結んで事業にし、seed に書く（風土記の判断）。

    bun run --cwd pipeline project:link-projects            # seed に無い行だけを判断して足す
    bun run --cwd pipeline project:link-projects --refresh  # 全部を判断し直す（事業ID も振り直す）

入力は dbt を build した warehouse の `int_project__lines`（事業の行と、資料をまたいで引く鍵）。
手順は docs/prd/jurisdiction-page-data/project-domain-model.md の「事業を作る」の1〜3。

1. 当初予算の事業の行を1つずつ、事業の1年度にする。
2. 同じ年度の決算の行を、会計・款・項・目と名前の並びが同じ当初予算の行に結ぶ。並びが両方に同じ数だけあるときだけ、印字の順で結ぶ。
   並びの中は印字の順（int_project__lines の print_order）で並べる。結べない決算の行は、決算の行だけを持つ事業の1年度にする。
3. 前の年度の事業の1年度と、上の段から結ぶ。目の直下は会計・款・項・目と名前、その下は親が同じ事業の中で名前が、
   両方に1つずつあるときだけ同じ事業にする。前の年度に無い事業は新しい事業にする（手順4の Jev はまだ使わない）。

名前は NFKC にし、【所管課】から後ろと空白を除いて比べる。事業ID は seed で一度だけ振る（最初の行の鍵の sha256）。
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import duckdb
import yaml

PIPELINE = Path(__file__).resolve().parents[2]
SEED = PIPELINE / 'dbt/seeds/project/project_line.csv'
KEY = ('jurisdiction_code', 'fiscal_year', 'document_kind', 'account_name', 'kan_name', 'kou_name', 'moku_name', 'path')
COLUMNS = (*KEY, 'project_id', 'method')


def normalize(name: str) -> str:
    """名前を比べる形。NFKC、【所管課】から後ろ（所管課と注記）と空白を除く。"""
    text = unicodedata.normalize('NFKC', name)
    return re.sub(r'\s', '', re.sub(r'【.*$', '', text))


@dataclass
class Line:
    detail_id: str
    parent_detail_id: str | None
    key: tuple
    name: str
    print_order: int = 0

    @property
    def scope(self) -> tuple:
        """会計・款・項・目"""
        return self.key[3:7]


@dataclass
class Year:
    """事業の1年度。当初予算と決算の少なくとも一方の行を持つ"""
    initial: Line | None = None
    settlement: Line | None = None
    parent: Year | None = None
    previous: Year | None = None
    project_id: str | None = None
    method: str = 'new'
    children: list[Year] = field(default_factory=list)

    @property
    def line(self) -> Line:
        return self.initial or self.settlement  # type: ignore[return-value]

    @property
    def lines(self) -> list[Line]:
        return [x for x in (self.initial, self.settlement) if x]


def load_lines(warehouse: Path) -> dict[str, dict[int, dict[str, list[Line]]]]:
    """自治体 → 年度 → 資料区分 → 事業の行"""
    con = duckdb.connect(str(warehouse), read_only=True)
    rows = con.sql(f'select detail_id, parent_detail_id, {", ".join(KEY)}, name, print_order from int_project__lines').fetchall()
    out: dict = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    for detail_id, parent, *key, name, print_order in rows:
        line = Line(detail_id, parent, tuple(key), name, print_order)
        out[key[0]][key[1]][key[2]].append(line)
    return out


def name_paths(lines: list[Line]) -> dict[str, tuple]:
    """行ごとの、枝の根からの比べる名前の並び"""
    by_id = {x.detail_id: x for x in lines}
    memo: dict[str, tuple] = {}

    def path(x: Line) -> tuple:
        if x.detail_id not in memo:
            parent = by_id.get(x.parent_detail_id) if x.parent_detail_id else None
            memo[x.detail_id] = (path(parent) if parent else ()) + (normalize(x.name),)
        return memo[x.detail_id]

    return {x.detail_id: path(x) for x in lines}


def build_years(docs: dict[str, list[Line]]) -> list[Year]:
    """手順1・2: 1つの年度の事業の1年度"""
    initial, settlement = docs.get('initial', []), docs.get('settlement', [])
    paths = name_paths(initial) | name_paths(settlement)
    groups: dict[tuple, tuple[list[Line], list[Line]]] = defaultdict(lambda: ([], []))
    for x in initial:
        groups[(x.scope, paths[x.detail_id])][0].append(x)
    for x in settlement:
        groups[(x.scope, paths[x.detail_id])][1].append(x)
    years: list[Year] = []
    for budget, settled in groups.values():
        if len(budget) == len(settled):
            pairs = zip(sorted(budget, key=lambda x: x.print_order), sorted(settled, key=lambda x: x.print_order))
            years += [Year(initial=b, settlement=s) for b, s in pairs]
        else:
            years += [Year(initial=b) for b in budget] + [Year(settlement=s) for s in settled]
    owner = {x.detail_id: y for y in years for x in y.lines}
    for y in years:
        parent = y.line.parent_detail_id
        if parent:
            y.parent = owner[parent]
            y.parent.children.append(y)
    return years


def unique_pairs(current: list[Year], previous: list[Year], key) -> list[tuple[Year, Year]]:
    """鍵が両方に1つずつある組"""
    a: dict = defaultdict(list)
    b: dict = defaultdict(list)
    for y in current:
        a[key(y)].append(y)
    for y in previous:
        b[key(y)].append(y)
    return [(a[k][0], b[k][0]) for k in a if len(a[k]) == 1 and len(b.get(k, [])) == 1]


def link_previous(current: list[Year], previous: list[Year]) -> None:
    """手順3: 上の段から前の年度と結ぶ"""
    name = lambda y: normalize(y.line.name)  # noqa: E731
    roots = [y for y in current if y.parent is None]
    for y, p in unique_pairs(roots, [y for y in previous if y.parent is None], lambda y: (y.line.scope, name(y))):
        y.previous = p
    queue = [y for y in roots if y.previous]
    while queue:
        parent = queue.pop()
        for y, p in unique_pairs(parent.children, parent.previous.children, name):  # type: ignore[union-attr]
            y.previous = p
            queue.append(y)


def project_id(line: Line) -> str:
    return hashlib.sha256(json.dumps(['project', *map(str, line.key)], ensure_ascii=False).encode()).hexdigest()


def assign(years_by_year: dict[int, list[Year]], seed: dict[tuple, dict]) -> None:
    """事業ID。seed にある行はその ID、前の年度と結んだものは前の年度の ID、残りは新しい ID"""
    for fiscal_year in sorted(years_by_year):
        used: set[str] = set()
        years = years_by_year[fiscal_year]
        for y in years:
            known = next((seed[x.key] for x in y.lines if x.key in seed), None)
            if known:
                y.project_id, y.method = known['project_id'], known['method']
                used.add(y.project_id)
        for y in years:
            if y.project_id:
                continue
            if y.previous and y.previous.project_id and y.previous.project_id not in used:
                y.project_id, y.method = y.previous.project_id, 'continued'
            else:
                y.project_id, y.method = project_id(y.line), 'new'
            used.add(y.project_id)


def read_seed() -> dict[tuple, dict]:
    if not SEED.exists():
        return {}
    with SEED.open(encoding='utf-8', newline='') as f:
        return {tuple(int(r[k]) if k == 'fiscal_year' else r[k] for k in KEY): r for r in csv.DictReader(f)}


def write_seed(rows: list[dict]) -> None:
    rows.sort(key=lambda r: tuple(str(r[k]) for k in KEY))
    with SEED.open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS, lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--refresh', action='store_true', help='seed を使わず全部を判断し直す')
    args = parser.parse_args()
    dbt = PIPELINE / 'dbt'
    profile = yaml.safe_load((dbt / 'profiles.yml').read_text())['fudoki']['outputs']['dev']
    lines = load_lines((dbt / profile['path']).resolve())
    seed = {} if args.refresh else read_seed()
    rows, summary = [], {}
    for jurisdiction, by_year in lines.items():
        years_by_year = {fy: build_years(docs) for fy, docs in by_year.items()}
        for fy in sorted(years_by_year):
            if fy - 1 in years_by_year:
                link_previous(years_by_year[fy], years_by_year[fy - 1])
        assign(years_by_year, seed)
        for fy, years in years_by_year.items():
            for y in years:
                rows += [dict(zip(KEY, x.key)) | {'project_id': y.project_id, 'method': y.method} for x in y.lines]
            summary[f'{jurisdiction}/{fy}'] = {m: sum(y.method == m for y in years) for m in ('continued', 'new')}
    current = {tuple(r[k] for k in KEY) for r in rows}
    write_seed(rows)
    print(json.dumps({'rows': len(rows), 'stale_seed_rows': sum(k not in current for k in seed), 'years': summary},
                     ensure_ascii=False))


if __name__ == '__main__':
    main()
