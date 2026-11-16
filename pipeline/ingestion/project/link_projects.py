"""予算書・決算書の事業の行を、同じ年度の当初予算と決算、前の年度とで結んで事業にする（風土記の判断）。

dbt の `int_project__line_ids`（Python model）が、build のたびに `int_project__lines` の全部の事業の行に当てる。
内訳の分け方を「事業」と宣言した自治体は、どこでも事業になる（自治体を選ぶ入口は持たない）。
手順は docs/prd/jurisdiction-page-data/project-domain-model.md の「事業を作る」の1〜3。

1. 当初予算の事業の行を1つずつ、事業の1年度にする。
2. 同じ年度の決算の行を、会計・款・項・目と名前の並びが同じ当初予算の行に結ぶ。並びが両方に同じ数だけあるときだけ、印字の順で結ぶ。
   並びの中は印字の順（int_project__lines の print_order）で並べる。結べなかった残りどうしは、上の段から、親が同じ事業の1年度と
   決まった中で、数を除いた名前（下の「数を除いた名前」）で同じ決まりで結ぶ（当初予算は「7歳~69歳分16,124,513×0.7=」、決算は「7歳~69歳分0.7」と印字する事業）。
   結べない決算の行は、決算の行だけを持つ事業の1年度にする。
3. 前の年度の事業の1年度と、上の段から結ぶ。目の直下は会計・款・項・目と名前、その下は親が同じ事業の中で名前が、
   両方に1つずつあるときだけ同じ事業にする。名前で結べなかった残りどうしは、名前から数と単位（「105園」「延83,703人」）を
   除いて同じ決まりで結ぶ（園の数・定員のように年度で変わる数を名前に印字する事業）。数を除いた名前は、それに加えて名前の末尾の
   数と式（「16,124,513×0.7=」）も除く。前の年度に無い事業は新しい事業にする（手順4の Jev はまだ使わない）。

名前は NFKC にし、【所管課】から後ろ・末尾の [所管課]・「(うち…)」の注記・空白を除いて比べる。
事業ID は事業の最初の年度の行の鍵の sha256。毎回計算し直しても、最初の年度の行が変わらない限り同じ ID になる。
"""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass, field

# 所管課を [] で印字する自治体（中央区・八王子など）。[1人分]・[科目存置] のような注記は所管課の語尾で外す
DEPARTMENT_BRACKET = re.compile(r'\[[^\[\]0-9]*(?:課|部|局|室|所|係|センター|委員会|館)\]\s*$')
KEY = ('jurisdiction_code', 'fiscal_year', 'document_kind', 'account_name', 'kan_name', 'kou_name', 'moku_name', 'path')


# 名前に印字された数と単位（「105園」「延83,703人」）。年度で変わるので、前の年度と結ぶときの2回目だけ除いて比べる。
# 単位の付かない数と「第1」のような番号は、別の事業を見分ける数なので除かない
COUNT = re.compile(r'(?<![第0-9,.])(?:延|約)?[0-9][0-9,.]*(?:か所|箇所|ヶ所|カ所|世帯|施設|団体|園|人|件|校|名|回|台|戸|床|室|館|個|点|冊|枚|日|か月|ヶ月|月|年|千円|万円|円|kW|t|%)')


# 名前の末尾に印字された数と式（「16,124,513×0.7=」「0.7」）。人数や率のように年度・資料で変わる。「第1」のような番号は除かない
TRAILING_NUMBERS = re.compile(r'(?<![第0-9,.])[0-9][0-9,.×=\s]*$')


def normalize(name: str) -> str:
    """名前を比べる形。NFKC、【所管課】から後ろ（所管課と注記）、末尾の [所管課]、「(うち…)」の内訳の注記（職員費の退職手当負担金の額など、年度で変わる）と空白を除く。"""
    text = DEPARTMENT_BRACKET.sub('', re.sub(r'【.*$', '', unicodedata.normalize('NFKC', name)))
    return re.sub(r'\s', '', re.sub(r'\(うち[^)]*\)', '', text))


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


def group_lines(rows) -> dict[str, dict[int, dict[str, list[Line]]]]:
    """(detail_id, parent_detail_id, *KEY, name, print_order) の行を、自治体 → 年度 → 資料区分 → 事業の行にまとめる"""
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


def pair_in_order(budget: list[Line], settled: list[Line]) -> list[Year]:
    """同じ数の当初予算と決算の行を、印字の順で組にする"""
    pairs = zip(sorted(budget, key=lambda x: x.print_order), sorted(settled, key=lambda x: x.print_order))
    return [Year(initial=b, settlement=s) for b, s in pairs]


def loose(name: str) -> str:
    """比べる名前（normalize 済み）から数を除いた形"""
    return TRAILING_NUMBERS.sub('', COUNT.sub('', name))


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
    rest: list[Line] = []
    for budget, settled in groups.values():
        if len(budget) == len(settled):
            years += pair_in_order(budget, settled)
        else:
            rest += budget + settled
    # 名前の並びで結べなかった残りは、上の段から、親が同じ事業の1年度の中で、数を除いた名前でもう一度組にする
    # （親を名前で比べると、数だけ違う別の親の子どうしを結んでしまう）
    owner = {x.detail_id: y for y in years for x in y.lines}
    for depth in sorted({len(paths[x.detail_id]) for x in rest}):
        loose_groups: dict[tuple, tuple[list[Line], list[Line]]] = defaultdict(lambda: ([], []))
        for x in rest:
            if len(paths[x.detail_id]) == depth:
                parent = owner.get(x.parent_detail_id) if x.parent_detail_id else None
                key = (x.scope, id(parent) if parent else None, loose(paths[x.detail_id][-1]))
                loose_groups[key][0 if x.key[2] == 'initial' else 1].append(x)
        for budget, settled in loose_groups.values():
            made = pair_in_order(budget, settled) if len(budget) == len(settled) else [Year(initial=b) for b in budget] + [Year(settlement=s) for s in settled]
            years += made
            owner |= {x.detail_id: y for y in made for x in y.lines}
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


def without_counts(name: str) -> str:
    """数を除いた名前。数と単位（「105園」）と、名前の末尾の数と式（「16,124,513×0.7=」）を除く"""
    return loose(normalize(name))


def pair(current: list[Year], previous: list[Year], key) -> list[Year]:
    """名前で一意に結び、残りどうしを数を除いた名前で一意に結ぶ。結んだ今年度の事業の1年度を返す"""
    linked = []
    for name in (normalize, without_counts):
        used = {id(y.previous) for y in current if y.previous}
        rest, candidates = [y for y in current if not y.previous], [p for p in previous if id(p) not in used]
        for y, p in unique_pairs(rest, candidates, lambda y: key(y, name(y.line.name))):
            y.previous = p
            linked.append(y)
    return linked


def link_previous(current: list[Year], previous: list[Year]) -> None:
    """手順3: 上の段から前の年度と結ぶ"""
    roots = [y for y in current if y.parent is None]
    queue = pair(roots, [y for y in previous if y.parent is None], lambda y, name: (y.line.scope, name))
    while queue:
        parent = queue.pop()
        queue += pair(parent.children, parent.previous.children, lambda y, name: name)  # type: ignore[union-attr]


def project_id(line: Line) -> str:
    return hashlib.sha256(json.dumps(['project', *map(str, line.key)], ensure_ascii=False).encode()).hexdigest()


def assign(years_by_year: dict[int, list[Year]]) -> None:
    """事業ID。前の年度と結んだものは前の年度の ID、残りは新しい ID"""
    for fiscal_year in sorted(years_by_year):
        used: set[str] = set()
        for y in years_by_year[fiscal_year]:
            if y.previous and y.previous.project_id and y.previous.project_id not in used:
                y.project_id, y.method = y.previous.project_id, 'continued'
            else:
                y.project_id, y.method = project_id(y.line), 'new'
            used.add(y.project_id)


def link(rows) -> list[tuple[str, str, str]]:
    """事業の行ごとの (detail_id, project_id, method)"""
    out = []
    for by_year in group_lines(rows).values():
        years_by_year = {fy: build_years(docs) for fy, docs in by_year.items()}
        for fy in sorted(years_by_year):
            if fy - 1 in years_by_year:
                link_previous(years_by_year[fy], years_by_year[fy - 1])
        assign(years_by_year)
        out += [(x.detail_id, y.project_id, y.method) for years in years_by_year.values() for y in years for x in y.lines]
    return out
