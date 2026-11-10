"""自治体の頁の OG 画像（public/jurisdictions/<code>/og.png）を、紋章と名前から作る。

`bun run --cwd apps/web build:og` で、紋章（emblem.svg）を置いた自治体の分だけ作り直す。
金額は年度で変わるため画像に入れない。文字はロゴと同じ書体をパス化し、端末の書体に依存させない。
"""

import base64
import json
import subprocess
import tempfile
from pathlib import Path

from fonts import load_glyphs

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PUBLIC = HERE.parent / "public"
CONFIG = json.loads((HERE / "config.json").read_text())
INK, PAPER, WEIGHT = CONFIG["ink"], CONFIG["paper"], CONFIG["weight"]
JURISDICTIONS = json.loads((ROOT / "packages/jurisdictions/jurisdictions.json").read_text())["jurisdictions"]
TAGLINE = "まちのお金、何に使ってる？"
OW, OH, LEFT = 1200, 630, 80
EMBLEM_BOX, EMBLEM_Y = 200, 200
NAME_X = LEFT + EMBLEM_BOX + 48
NAME_MAX_W = OW - NAME_X - LEFT


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
    if code[2:5] == "000":
        return None
    return JURISDICTIONS[f"{code[:2]}0001"]["name"] if f"{code[:2]}0001" in JURISDICTIONS else None


def og_svg(code: str, found: dict, logo: str) -> str:
    name = JURISDICTIONS[code]["name"]
    prefecture = prefecture_of(code)
    size = min(104, NAME_MAX_W / max(text_width(name, 1, found), 1e-9))
    name_baseline = EMBLEM_Y + EMBLEM_BOX / 2 + size * 0.36 + (22 if prefecture else 0)
    lines = f'<g fill="{INK}">{text(name, size, NAME_X, name_baseline, found)}</g>'
    if prefecture:
        lines += f'<g fill="{INK}" fill-opacity="0.72">{text(prefecture, 36, NAME_X + 4, name_baseline - size - 14, found)}</g>'
    pad = 24
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{OW}" height="{OH}" viewBox="0 0 {OW} {OH}">'
        f'<rect width="{OW}" height="{OH}" fill="{PAPER}"/>'
        f'<image href="{logo}" x="{LEFT}" y="64" height="56" width="220" preserveAspectRatio="xMinYMid meet"/>'
        f'<rect x="{LEFT}" y="{EMBLEM_Y}" width="{EMBLEM_BOX}" height="{EMBLEM_BOX}" rx="32" fill="#ffffff"/>'
        f'<image href="{data_uri(PUBLIC / "jurisdictions" / code / "emblem.svg")}" x="{LEFT + pad}" y="{EMBLEM_Y + pad}" '
        f'width="{EMBLEM_BOX - pad * 2}" height="{EMBLEM_BOX - pad * 2}" preserveAspectRatio="xMidYMid meet"/>'
        f"{lines}"
        f'<g fill="{INK}">{text(TAGLINE, 34, LEFT, 540, found, 0.06)}</g>'
        f"</svg>"
    )


def main() -> None:
    codes = sorted(p.parent.name for p in (PUBLIC / "jurisdictions").glob("*/emblem.svg"))
    chars = "".join(sorted({ch for c in codes for ch in JURISDICTIONS[c]["name"]} | set(TAGLINE) | {
        ch for c in codes if (p := prefecture_of(c)) for ch in p}))
    found = load_glyphs(CONFIG["font"], WEIGHT, chars)
    logo = data_uri(PUBLIC / "logo.svg")
    with tempfile.TemporaryDirectory() as directory:
        for code in codes:
            source = Path(directory) / f"{code}.svg"
            source.write_text(og_svg(code, found, logo))
            subprocess.run([
                "mise", "x", "imagemagick@7.1.2_27", "--", "magick", "-density", "192", str(source),
                "-resize", f"{OW}x{OH}", "-strip", "-define", "png:compression-level=9",
                f"PNG24:{PUBLIC / 'jurisdictions' / code / 'og.png'}",
            ], check=True)
    print(f"{len(codes)} 自治体の og.png を生成")


if __name__ == "__main__":
    main()
