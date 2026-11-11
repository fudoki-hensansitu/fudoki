# 試作: 比べるの「となりのまち」を map/*.geojson から作る。境界の頂点を2つ以上共有する自治体の組をとなりとする
# 実行: python3 apps/web/prototype/neighbors.py（apps/web/prototype/neighbors.json を書き直す）
import json
from collections import defaultdict
from pathlib import Path

here = Path(__file__).parent
points = defaultdict(set)
for name in ("tokyo", "hyogo"):
    for f in json.loads((here.parent / "map" / f"{name}.geojson").read_text())["features"]:
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            for ring in poly:
                for x, y in ring:
                    points[(x, y)].add(f["properties"]["code"])

shared = defaultdict(int)
for codes in points.values():
    for a in codes:
        for b in codes:
            if a < b:
                shared[(a, b)] += 1

near = defaultdict(set)
for (a, b), n in shared.items():
    if n >= 2:
        near[a].add(b)
        near[b].add(a)

(here / "neighbors.json").write_text(json.dumps({k: sorted(v) for k, v in sorted(near.items())}, ensure_ascii=False))
