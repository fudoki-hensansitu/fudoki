"""回答記録から、検索出力の続きを最後まで読んだかを集計する。外部サービスには接続しない。

使い方: python3 audit2.py <作業dir>
出力: 集合ごとの回答数・続きを読み残した回答数・more の必要回数と実行回数（JSON）。
out_pages の無い旧実行は対象外として数え、全文を読んだとは扱わない。
"""
import argparse
from collections import defaultdict
import json
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument('work', type=Path)
args = ap.parse_args()
groups = defaultdict(lambda: {'answered': 0, 'unread': 0, 'unknown': 0, 'more_needed': 0, 'more_called': 0})
for q in json.loads((args.work / 'trial/questions2.json').read_text()):
    path = args.work / 'agent' / f'{q["id"]}.jsonl'
    rows = [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []
    if not any(row['kind'] == 'answer' for row in rows):
        continue
    group = groups[q['set']]
    group['answered'] += 1
    searches = [row for row in rows if row['kind'] == 'search']
    if any('out_pages' not in row for row in searches):
        group['unknown'] += 1
        continue
    # 引き直すと pending が置き換わるので、検索ごとに続きを数える。
    pending = 0
    unread = False
    for row in rows:
        if row['kind'] == 'search':
            unread |= pending > 0
            pending = row['out_pages'] - 1
            group['more_needed'] += pending
        elif row['kind'] == 'more':
            pending -= 1
            group['more_called'] += 1
            if pending < 0:
                raise ValueError(f'{q["id"]}: 検索出力より more の記録が多い')
        elif row['kind'] == 'answer':
            unread |= pending > 0
    group['unread'] += unread
print(json.dumps(dict(groups), ensure_ascii=False, indent=2))
