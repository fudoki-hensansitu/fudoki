"""決算の取り込み表（ノードの表）から、一般会計の目の名前と款・項を取り出す。第2段の「目の名前からの問い」の元。

先に取り込み表を復元する（R2 は読むだけ）:
  cd pipeline && uv run python -m ingestion.fiscal.run restore --manifest ingestion/fiscal/jurisdictions/<団体>/2025/settlement/expenditure.json --remote
使い方: uv run --project pipeline python moku.py <pipeline/.cache のdir> <出力dir>
出力: moku.json（各要素 {id, jurisdiction, kan, kou, moku, page}）。名前は印字の空白・改行を除いたもの。
"""
import json, re, sys
import duckdb

TABLES = {'131172': 'general-setsu', '131148': 'general-setsu'}
cache, outdir = sys.argv[1:3]
norm = lambda s: re.sub(r'\s+', '', s or '')
out = []
for j, t in TABLES.items():
    p = f'{cache}/objects/fiscal/ingestion/{j}/2025/settlement/expenditure/{t}-nodes.parquet'
    rows = duckdb.sql(f"""with n as (select * from read_parquet('{p}'))
        select k.name_text, h.name_text, m.name_text, m.physical_page from n m
        join n h on m.parent_node_key = h.node_key join n k on h.parent_node_key = k.node_key
        where m.level_header = '目' order by m.physical_page, m.y0""").fetchall()
    for i, (kan, kou, moku, page) in enumerate(rows):
        out.append({'id': f'm{j[-3:]}-{i:03d}', 'jurisdiction': j, 'kan': norm(kan), 'kou': norm(kou), 'moku': norm(moku), 'page': page})
json.dump(out, open(f'{outdir}/moku.json', 'w'), ensure_ascii=False, indent=1)
print(len(out))
