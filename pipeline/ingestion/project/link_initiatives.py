"""予算案のプレス発表の施策を、同じ年度の当初予算書の内訳（事業）の1行に紐付け、seed に書く（風土記の判断）。

    bun run --cwd pipeline project:link-initiatives            # seed に無い施策だけ紐付ける（Jev を呼ぶ。CI では回さない）
    bun run --cwd pipeline project:link-initiatives --refresh  # 全部を紐付け直す

入力は dbt を build した warehouse（`ingestion.project_budget_initiative` と `fiscal_expenditure_detail`）。手順は
.agents/skills/pipeline/references/link-to-budget-detail.md。

1. 名前と額で1行に決まるもの（正規化した名前の一致、または部分一致かつ予算額が円まで一致）を先に確定する（method=name）。
2. 残りは単語の Dice 係数で上位12件の候補を出し、Jev に「どれでもない」を含めて選ばせる。確信度 0.6 以上だけ採る（method=jev）。
3. どれにも当たらない施策も行を残す（method=none、detail_id 空）。seed に行があれば次からは聞き直さない。
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import subprocess
import unicodedata
from pathlib import Path

import duckdb
import yaml

from ingestion.lib.digit_recheck import KEY_ENV, MODEL, _post

PIPELINE = Path(__file__).resolve().parents[2]
SEED = PIPELINE / 'dbt/seeds/project/project_budget_initiative_link.csv'
SEGMENT = Path(__file__).with_name('segment.ts')
COLUMNS = ('jurisdiction_code', 'fiscal_year', 'page', 'detail_id', 'method', 'confidence', 'model')
CANDIDATES = 12
THRESHOLD = 0.6
# どの内訳の名前にも付く語。重なりの点に数えない
GENERIC = frozenset('事業 経費 推進 支援 運営 整備 管理 実施 関係 関連 費 等 事務 対策 充実 強化 拡充 促進 及び および'.split())
INSTRUCTIONS = ('自治体の予算案のプレス発表に載った施策 `施策` を、同じ年度の当初予算書の内訳の行に対応付ける。'
                '`施策` の事業が予算書で計上されている内訳はどれか。')


def normalize(name: str) -> str:
    """名前を比べる形。NFKC、空白・括弧・記号と末尾の【課名】を除く。"""
    text = unicodedata.normalize('NFKC', name)
    text = re.sub(r'【[^】]*】$', '', text)
    return re.sub(r'[\s()（）「」『』・、,.\-~〜]', '', text)


def segment(texts: list[str]) -> list[list[str]]:
    output = subprocess.run(['bun', str(SEGMENT)], input=json.dumps(texts, ensure_ascii=False), text=True,
                            capture_output=True, check=True).stdout
    return json.loads(output)


def words(tokens: list[str]) -> set[str]:
    return {t for t in tokens if t not in GENERIC and not re.fullmatch(r'[ぁ-ゟ]', t)}


def dice(a: set[str], b: set[str]) -> float:
    return 2 * len(a & b) / (len(a) + len(b)) if a and b else 0.0


def direct(item: dict, details: list[dict]) -> dict | None:
    """名前と額で1行に決まる内訳。同じ名前が複数あれば額で絞り、それでも1つに決まらなければ Jev に回す。"""
    names = {normalize(n) for n in item['names']}
    budget = item['budget_yen']
    exact = [d for d in details if normalize(d['name']) in names]
    if exact:
        if len(exact) > 1 and budget:
            exact = [d for d in exact if d['amount_yen'] == budget]
        return exact[0] if len(exact) == 1 else None
    partial = [d for d in details if budget and d['amount_yen'] == budget
               and any(n in normalize(d['name']) or normalize(d['name']) in n for n in names)]
    return partial[0] if len(partial) == 1 else None


def ask(key: str, item: dict, candidates: list[dict], model: str) -> tuple[dict | None, float]:
    state = {'施策': {'見出し': item['title'], '事業名': item['names'], '予算額（円）': item['budget_yen'],
                     '要点': item['points']}}
    criteria = {f'c{i}': f'予算書の内訳「{c["name"]}」（{c["kan_name"]}・{c["moku_name"]}）'
                for i, c in enumerate(candidates)}
    criteria['none'] = 'この施策を含む内訳は上のどれでもない'
    answer = _post(key, state, {'link': {'type': 'choice', 'instructions': INSTRUCTIONS, 'criteria': criteria}},
                   model)['answers']['link']
    if answer['choice'] == 'none':
        return None, answer['confidence']
    return candidates[int(answer['choice'][1:])], answer['confidence']


def read_seed() -> dict[tuple, dict]:
    if not SEED.exists():
        return {}
    with SEED.open(encoding='utf-8') as stream:
        return {(r['jurisdiction_code'], int(r['fiscal_year']), int(r['page'])): r for r in csv.DictReader(stream)}


def write_seed(rows: dict[tuple, dict]) -> None:
    SEED.parent.mkdir(parents=True, exist_ok=True)
    with SEED.open('w', encoding='utf-8', newline='') as stream:
        writer = csv.DictWriter(stream, COLUMNS, lineterminator='\n')
        writer.writeheader()
        for key in sorted(rows):
            writer.writerow({c: rows[key].get(c, '') for c in COLUMNS})


def warehouse() -> Path:
    profile = yaml.safe_load((PIPELINE / 'dbt/profiles.yml').read_text())['fudoki']['outputs']['dev']
    return (PIPELINE / 'dbt' / profile['path']).resolve()


def link(*, refresh: bool = False, model: str = MODEL) -> dict:
    previous = read_seed()
    seed = {} if refresh else dict(previous)
    with duckdb.connect(str(warehouse()), read_only=True) as con:
        items = [dict(zip(('jurisdiction_code', 'fiscal_year', 'page', 'title', 'names', 'budget_yen', 'points'), row))
                 for row in con.execute(
                     "select o.jurisdiction_code, o.fiscal_year, p.page, p.title, p.names, p.budget_thousand * 1000, p.points"
                     " from ingestion.project_budget_initiative p join ingestion.project_origin o using (origin_id)"
                     " order by 1, 2, 3").fetchall()]
        todo = [i for i in items if (i['jurisdiction_code'], i['fiscal_year'], i['page']) not in seed]
        details: dict[tuple, list[dict]] = {}
        for jurisdiction, year in sorted({(i['jurisdiction_code'], i['fiscal_year']) for i in todo}):
            details[(jurisdiction, year)] = [dict(zip(('detail_id', 'name', 'kan_name', 'moku_name', 'amount_yen'), row))
                                             for row in con.execute(
                "select detail_id, name, kan_name, moku_name, amount_yen from fiscal_expenditure_detail"
                " where jurisdiction_code = ? and fiscal_year = ? and document_kind = 'initial'"
                " and amendment_number is null and breakdown = '事業' order by detail_id", [jurisdiction, year]).fetchall()]
            if not details[(jurisdiction, year)]:
                raise ValueError(f'当初予算書の内訳（事業）が無い: {jurisdiction} {year}')
    key = os.environ.get(KEY_ENV)
    counts = {'name': 0, 'jev': 0, 'none': 0}
    try:
        for item in todo:
            item['names'], item['points'] = json.loads(item['names']), json.loads(item['points'])
            pool = details[(item['jurisdiction_code'], item['fiscal_year'])]
            row = {'jurisdiction_code': item['jurisdiction_code'], 'fiscal_year': item['fiscal_year'], 'page': item['page']}
            found = direct(item, pool)
            if found:
                row.update(detail_id=found['detail_id'], method='name')
            else:
                if not key:
                    raise ValueError(f'{KEY_ENV} が無いので Jev に聞けない')
                texts = segment([' '.join([item['title'], *item['names']]), *(d['name'] for d in pool)])
                mine = words(texts[0])
                ranked = sorted(zip(pool, texts[1:], strict=True), key=lambda pair: (-dice(mine, words(pair[1])), pair[0]['detail_id']))
                choice, confidence = ask(key, item, [d for d, _ in ranked[:CANDIDATES]], model)
                row.update(confidence=round(confidence, 2), model=model)
                if choice and confidence >= THRESHOLD:
                    row.update(detail_id=choice['detail_id'], method='jev')
                else:
                    row.update(method='none')
            counts[row['method']] += 1
            seed[(item['jurisdiction_code'], item['fiscal_year'], item['page'])] = row
    except BaseException:
        write_seed({**previous, **seed})  # 途中で失敗したら、決まった分を足して前の行は残す
        raise
    write_seed(seed)
    return {'linked': counts, 'kept': len(items) - len(todo)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--refresh', action='store_true', help='seed にある施策も紐付け直す')
    args = parser.parse_args()
    print(json.dumps(link(refresh=args.refresh), ensure_ascii=False))


if __name__ == '__main__':
    main()
