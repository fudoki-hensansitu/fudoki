# 試作: 地図で選ぶ・似たまちに使う、まちの形（SVG の path）と面積を map/*.geojson から作る
# 実行: python3 apps/web/prototype/shapes.py（apps/web/prototype/shapes.json を書き直す）
# 地図は東京の島しょ以外を描く。面積は全部のまち（緯度で経度を縮めた平面の近似）
import json, math
from pathlib import Path

here = Path(__file__).parent
W = 1000  # 地図の横幅（viewBox の単位）
R = 6371.0088

def rings(g):
    return [ring for poly in (g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]) for ring in poly]

def area_km2(g):
    total = 0.0
    for poly in (g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]):
        for i, ring in enumerate(poly):
            lat0 = math.radians(sum(y for _, y in ring) / len(ring))
            pts = [(math.radians(x) * math.cos(lat0) * R, math.radians(y) * R) for x, y in ring]
            a = abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]))) / 2
            total += a if i == 0 else -a
    return round(total, 2)

out = {"areas": {}, "map": {"width": W, "height": 0, "towns": []}}
tokyo = []
for name in ("tokyo", "hyogo"):
    for f in json.loads((here.parent / "map" / f"{name}.geojson").read_text())["features"]:
        p = f["properties"]
        out["areas"][p["code"]] = area_km2(f["geometry"])
        if name == "tokyo" and not p.get("island"):
            tokyo.append(f)

xs = [x for f in tokyo for r in rings(f["geometry"]) for x, _ in r]
ys = [y for f in tokyo for r in rings(f["geometry"]) for _, y in r]
k = math.cos(math.radians((min(ys) + max(ys)) / 2))
sx = W / ((max(xs) - min(xs)) * k)
H = round((max(ys) - min(ys)) * sx)
out["map"]["height"] = H
for f in tokyo:
    parts = []
    for r in rings(f["geometry"]):
        pts, last = [], None
        for x, y in r:
            q = (round((x - min(xs)) * k * sx, 1), round((max(ys) - y) * sx, 1))
            if q != last:
                pts.append(q)
                last = q
        if len(pts) >= 3:
            parts.append("M" + "L".join(f"{a:g} {b:g}" for a, b in pts) + "Z")
    out["map"]["towns"].append({"code": f["properties"]["code"], "name": f["properties"]["name"], "d": "".join(parts)})

(here / "shapes.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
