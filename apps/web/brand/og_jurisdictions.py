"""自治体の頁の OG 画像（public/jurisdictions/<code>/og.png）を、紋章・名前と、最新の決算の総額・分野別のサンキーから作る。

`bun run --cwd apps/web build:og` で、紋章（emblem.svg）を置いた自治体の分だけ作り直す。
金額は画面と同じ数字にするため、公開中の自治体の頁（fudoki.dev）が埋め込む cofogFlow（最新の決算の COFOG 大分類）を読む。
決算を取り込んで本番に出たら作り直す。決算の無い自治体（cofogFlow が空）は画像を作らず、全頁共通の OG 画像のままにする。
文字はロゴと同じ書体をパス化し、端末の書体に依存させない。緑は総額・ロゴ・サンキーに使い、文字は墨色にする。
"""

import base64
import csv
import json
import subprocess
import tempfile
import urllib.request
from pathlib import Path

from fonts import load_glyphs

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PUBLIC = HERE.parent / "public"
CONFIG = json.loads((HERE / "config.json").read_text())
INK, PAPER, WEIGHT = CONFIG["ink"], CONFIG["paper"], CONFIG["weight"]
JURISDICTIONS = json.loads((ROOT / "packages/jurisdictions/jurisdictions.json").read_text())["jurisdictions"]
# 都道府県名の正本は pipeline の prefecture_master（カタログに無い都道府県もあるため、自治体マスタからは引かない）
with (ROOT / "pipeline/dbt/seeds/jurisdiction/prefecture_master.csv").open(encoding="utf-8") as f:
    PREFECTURES = {row["prefecture_code"]: row["prefecture_name"] for row in csv.DictReader(f)}
PREFECTURE_SLUGS = json.loads((ROOT / "packages/jurisdictions/prefectures.json").read_text())["slugs"]
ORIGIN = "https://fudoki.dev"
TAGLINE = "まちのお金、何に使ってる？"
TEXT = "#2b2723"
OW, OH, LEFT = 1200, 630, 80
# サンキー: 総額の棒（左）から分野の棒（右）へ。名前を付けるのは大きい順に6分野で、残りは「ほか」にまとめる
TOP_AREAS, FLOW_TOP, FLOW_BOTTOM, LABEL_MIN = 6, 64, 566, 58
SOURCE_X, TARGET_X, BAR_W = 548, 852, 14


def data_uri(path: Path) -> str:
    return "data:image/svg+xml;base64," + base64.b64encode(path.read_bytes()).decode()


def text(s: str, size: float, x: float, baseline: float, found: dict, tracking: float = 0.04) -> str:
    """字形をパス化して並べる。字送りは advance に字間を足す。"""
    parts = []
    for ch in s:
        g = found[ch]
        k = size / g["upm"]
        parts.append(f'<path transform="translate({x:.4f} {baseline:.4f}) scale({k:.5f} -{k:.5f})" d="{g["d"]}"/>')
        x += g["adv"] * k + size * tracking
    return "".join(parts)


def text_width(s: str, size: float, found: dict, tracking: float = 0.04) -> float:
    return sum(found[ch]["adv"] * size / found[ch]["upm"] + size * tracking for ch in s) - size * tracking


def prefecture_of(code: str) -> str | None:
    """市区町村なら都道府県名を返す。都道府県そのもの（3〜5桁目が000）は None"""
    return None if code[2:5] == "000" else PREFECTURES[code[:2]]


def page_path(code: str) -> str:
    """自治体の頁の path。apps/web/jurisdiction/path.ts の jurisdictionPath と同じ規則"""
    prefecture = f"/{PREFECTURE_SLUGS[code[:2]]}"
    return prefecture if code[2:5] == "000" else f"{prefecture}/{JURISDICTIONS[code].get('slug', code)}"


def settlement(code: str) -> tuple[int, list[tuple[str, int]]] | None:
    """公開中の頁から、最新の決算の年度と COFOG 大分類ごとの金額（大きい順、「その他」が最後）を読む。決算が無ければ None"""
    html = urllib.request.urlopen(ORIGIN + page_path(code), timeout=60).read().decode()
    decoder, at = json.JSONDecoder(), html.find('"cofogFlow":')
    if at < 0:
        return None
    flow, _ = decoder.raw_decode(html[at + len('"cofogFlow":'):])
    years, _ = decoder.raw_decode(html[html.find('"years":') + len('"years":'):])
    areas = [(f["kan"]["name"], f["kan"]["yen"]) for f in flow if f["kan"]["yen"] > 0]
    return (years[-1]["year"], areas) if areas else None


def oku(yen: int) -> str:
    return f"{round(yen / 1e8):,}"


def sankey(areas: list[tuple[str, int]], found: dict) -> tuple[int, str]:
    """総額と、総額→分野のサンキーの SVG 断片。ラベルが重ならないよう、細い分野にも LABEL_MIN の枠を取る"""
    named = [a for a in areas if a[0] != "その他"][:TOP_AREAS]
    total = sum(yen for _, yen in areas)
    rest = total - sum(yen for _, yen in named)
    nodes = named + ([("ほか", rest)] if rest > 0 else [])
    room = FLOW_BOTTOM - FLOW_TOP
    k = (room - 12 * (len(nodes) - 1)) / total
    while sum(max(yen * k, LABEL_MIN) for _, yen in nodes) > room:
        k *= 0.97
    heights = [yen * k for _, yen in nodes]
    gap = (room - sum(max(h, LABEL_MIN) for h in heights)) / max(len(nodes) - 1, 1)
    source_h = total * k
    source_y = FLOW_TOP + (room - source_h) / 2
    parts = [f'<rect x="{SOURCE_X}" y="{source_y:.1f}" width="{BAR_W}" height="{source_h:.1f}" rx="3" fill="{INK}"/>']
    x0, x1 = SOURCE_X + BAR_W, TARGET_X
    c = (x0 + x1) / 2
    y_source, slot_y = source_y, FLOW_TOP
    for (name, yen), h in zip(nodes, heights):
        slot = max(h, LABEL_MIN)
        y = slot_y + (slot - h) / 2
        parts.append(
            f'<path d="M{x0} {y_source:.1f} C{c} {y_source:.1f} {c} {y:.1f} {x1} {y:.1f} L{x1} {y + h:.1f} '
            f'C{c} {y + h:.1f} {c} {y_source + h:.1f} {x0} {y_source + h:.1f} Z" fill="{INK}" fill-opacity="0.16"/>')
        parts.append(f'<rect x="{TARGET_X}" y="{y:.1f}" width="{BAR_W}" height="{max(h, 2):.1f}" rx="2" fill="{INK}"/>')
        mid, label_x = slot_y + slot / 2, TARGET_X + 30
        amount = oku(yen)
        parts.append(f'<g fill="{TEXT}" fill-opacity="0.65">{text(name, 19, label_x, mid - 4, found, 0.02)}</g>')
        parts.append(f'<g fill="{TEXT}">{text(amount, 26, label_x, mid + 25, found, 0)}'
                     f'{text("億円", 15, label_x + text_width(amount, 26, found, 0) + 4, mid + 25, found, 0.02)}</g>')
        y_source += h
        slot_y += slot + gap
    return total, "".join(parts)


def og_svg(code: str, year: int, areas: list[tuple[str, int]], found: dict, logo: str) -> str:
    name = JURISDICTIONS[code]["name"]
    prefecture = prefecture_of(code)
    size = min(64, 300 / text_width(name, 1, found))
    baseline = 236 + (14 if prefecture else 0)
    head = f'<g fill="{TEXT}">{text(name, size, 196, baseline, found)}</g>'
    if prefecture:
        head += f'<g fill="{TEXT}" fill-opacity="0.65">{text(prefecture, 24, 198, baseline - size - 8, found)}</g>'
    total, flow = sankey(areas, found)
    amount = oku(total)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{OW}" height="{OH}" viewBox="0 0 {OW} {OH}">'
        f'<rect width="{OW}" height="{OH}" fill="{PAPER}"/>'
        f'<image href="{logo}" x="{LEFT}" y="64" width="160" height="46" preserveAspectRatio="xMinYMid meet"/>'
        f'<rect x="{LEFT}" y="160" width="96" height="96" rx="18" fill="#ffffff"/>'
        f'<image href="{data_uri(PUBLIC / "jurisdictions" / code / "emblem.svg")}" x="{LEFT + 12}" y="172" width="72" height="72" '
        f'preserveAspectRatio="xMidYMid meet"/>'
        f"{head}"
        f'<g fill="{TEXT}" fill-opacity="0.65">{text(f"R{year - 2018}年度に使ったお金", 26, LEFT + 2, 352, found, 0.02)}</g>'
        f'<g fill="{INK}">{text(amount, 92, LEFT - 2, 448, found, 0)}'
        f'{text("億円", 36, LEFT + 6 + text_width(amount, 92, found, 0), 448, found, 0.02)}</g>'
        f'<g fill="{TEXT}">{text(TAGLINE, 26, LEFT + 2, 548, found, 0.06)}</g>'
        f"{flow}</svg>"
    )


def main() -> None:
    codes = sorted(p.parent.name for p in (PUBLIC / "jurisdictions").glob("*/emblem.svg"))
    data = {code: settlement(code) for code in codes}
    chars = set(TAGLINE + "0123456789,R年度に使ったお金億円ほか")
    for code, settled in data.items():
        chars |= set(JURISDICTIONS[code]["name"] + (prefecture_of(code) or ""))
        if settled:
            chars |= set("".join(name for name, _ in settled[1]))
    found = load_glyphs(CONFIG["font"], WEIGHT, "".join(sorted(chars)))
    logo = data_uri(PUBLIC / "logo.svg")
    made = 0
    with tempfile.TemporaryDirectory() as directory:
        for code, settled in data.items():
            out = PUBLIC / "jurisdictions" / code / "og.png"
            if not settled:
                out.unlink(missing_ok=True)
                continue
            source = Path(directory) / f"{code}.svg"
            source.write_text(og_svg(code, *settled, found, logo))
            subprocess.run([
                "mise", "x", "imagemagick@7.1.2_27", "--", "magick", "-density", "192", str(source),
                "-resize", f"{OW}x{OH}", "-strip", "-define", "png:compression-level=9", f"PNG24:{out}",
            ], check=True)
            made += 1
    print(f"{made} 自治体の og.png を生成（決算の無い {len(codes) - made} 自治体は作らない）")


if __name__ == "__main__":
    main()
