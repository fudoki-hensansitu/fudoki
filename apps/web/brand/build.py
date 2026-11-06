"""設定値と採用書体の輪郭から風土記のロゴ一式を生成する。

`bun run --cwd apps/web build:brand` で各 public ディレクトリと OG 画像を同期する。
字母は固定バージョンの Zen角ゴシック New（OFL-1.1）を使い、
SVG はパス化する。フォントの読み込みや端末の代替書体に依存させない。
"""

import base64
import shutil
import subprocess
import json
from functools import lru_cache
from pathlib import Path

from fonts import load_glyphs
from geometry import PARCELS, RADIUS, RIGHT

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PUBLIC = HERE.parent / "public"
CONFIG = json.loads((HERE / "config.json").read_text())
INK, INK_DARK, ACCENT, ACCENT_DARK, PAPER = (CONFIG[k] for k in ("ink", "inkDark", "accent", "accentDark", "paper"))
NAME, WEIGHT = "風土記", CONFIG["weight"]
H, TEXT_SIZE = CONFIG["canvasHeight"], CONFIG["textSize"]
TEXT_CENTER_Y = H / 2 + 0.5 + CONFIG["textOffsetY"]
MARK_SCALE = CONFIG["markScale"]
MARK_X, MARK_Y = CONFIG["markOffsetX"], CONFIG["markOffsetY"]
TEXT_X = MARK_X + RIGHT * MARK_SCALE + CONFIG["gap"]
# 全角の advance は「土」の左右に空きすぎるため、見える字面間で指定する。
PAIR_GAPS = CONFIG["pairGaps"]


@lru_cache
def glyphs() -> tuple[dict, ...]:
    """採用書体から必要な三文字の輪郭と字面を取り出す。"""
    found = load_glyphs(CONFIG["font"], WEIGHT)
    return tuple(found[ch] for ch in NAME)


def text_width(size: float) -> float:
    """輪郭の幅とペアごとの字間を共通のサイズへ換算する。"""
    return sum((g["bounds"][2] - g["bounds"][0]) * size / g["upm"] for g in glyphs()) + sum(PAIR_GAPS)


def wordmark(size: float, x: float, cy: float) -> str:
    """共通ベースラインで字面を揃え、ペアごとの見える空きを適用する。"""
    gl = glyphs()
    top = max(g["bounds"][3] / g["upm"] for g in gl)
    bottom = min(g["bounds"][1] / g["upm"] for g in gl)
    baseline = cy + (top + bottom) * size / 2
    parts = []
    for i, g in enumerate(gl):
        scale = size / g["upm"]
        parts.append(
            f'<path transform="translate({x - g["bounds"][0] * scale:.4f} {baseline:.4f}) '
            f'scale({scale:.5f} -{scale:.5f})" d="{g["d"]}"/>'
        )
        x += (g["bounds"][2] - g["bounds"][0]) * scale
        if i < len(PAIR_GAPS):
            x += PAIR_GAPS[i]
    return "".join(parts)


def mark(scale: float = 1, x: float = 0, y: float = 0, accent: str = ACCENT) -> str:
    """32 単位の区画を任意の位置・倍率で配置する。朱の区画だけ accent で塗る。"""
    def fill(is_accent: bool) -> str:
        if not is_accent:
            return ""
        # var() は fill= のような presentation attribute では解決されず、style の CSS プロパティ経由でだけ効く
        return f' style="fill:{accent}"' if accent.startswith("var(") else f' fill="{accent}"'
    parcels = "".join(
        f'<rect x="{px:g}" y="{py:g}" width="{w:g}" height="{h:g}" rx="{RADIUS:g}"{fill(a)}/>'
        for px, py, w, h, a in PARCELS
    )
    return f'<g transform="translate({x:g} {y:g}) scale({scale:g})">{parcels}</g>'


def svg(width: float, height: float, content: str, ink: str, themed: bool = False) -> str:
    """透過背景の SVG に塗りとアクセシブルな名前を付ける。themed は OS の明暗に追従する。"""
    theme = (
        f'<style>svg {{ color: {INK}; --logo-accent: {ACCENT}; }} '
        f'@media (prefers-color-scheme: dark) {{ svg {{ color: {INK_DARK}; --logo-accent: {ACCENT_DARK}; }} }}</style>'
        if themed else ""
    )
    fill = 'fill="currentColor"' if themed else f'fill="{ink}"'
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.4f} {height:g}" '
        f'role="img" aria-label="{NAME}">\n  <title>{NAME}</title>{theme}\n'
        f'  <g {fill}>{content}</g>\n</svg>\n'
    )


LOGO_WIDTH = TEXT_X + text_width(TEXT_SIZE) + 2
PUBLIC.mkdir(parents=True, exist_ok=True)
for suffix, ink, accent in (("", INK, ACCENT), ("-dark", INK_DARK, ACCENT_DARK)):
    (PUBLIC / f"mark{suffix}.svg").write_text(svg(32, 32, mark(accent=accent), ink))
    (PUBLIC / f"wordmark{suffix}.svg").write_text(
        svg(text_width(TEXT_SIZE) + 4, H, wordmark(TEXT_SIZE, 2, TEXT_CENTER_Y), ink)
    )
    (PUBLIC / f"logo{suffix}.svg").write_text(
        svg(LOGO_WIDTH, H, mark(MARK_SCALE, MARK_X, MARK_Y, accent) + wordmark(TEXT_SIZE, TEXT_X, TEXT_CENTER_Y), ink)
    )
FAVICON = svg(32, 32, mark(accent="var(--logo-accent)"), INK, themed=True)
(PUBLIC / "favicon.svg").write_text(FAVICON)
(ROOT / "apps/api/src/favicon.svg").write_text(FAVICON)

# 画面に inline で埋める写し。文字と区画は使う側の color、朱は画面の --shu に従う。
LOGO_G = f'<g fill="currentColor">{mark(MARK_SCALE, MARK_X, MARK_Y, f"var(--shu, {ACCENT})")}{wordmark(TEXT_SIZE, TEXT_X, TEXT_CENTER_Y)}</g>'
(HERE.parent / "logo.ts").write_text(
    "// build:brand が生成する（手で直さない）。正本は brand/config.json。色を画面の token に従わせるため、画面へ inline にする\n"
    f"export const LOGO_WIDTH = {LOGO_WIDTH:.4f}\n"
    f"export const LOGO_G = `{LOGO_G}`\n"
)

for target in (ROOT / "apps/docs/public",):
    for name in ("mark.svg", "mark-dark.svg", "wordmark.svg", "wordmark-dark.svg", "logo.svg", "logo-dark.svg", "favicon.svg"):
        shutil.copyfile(PUBLIC / name, target / name)

# OS の設定を追うファビコンと、画面の .dark で選ぶ SVG は分ける。
# 画像内部の prefers-color-scheme は画面側のクラスを参照できない。
OW, OH = 1200, 630
TAGLINE = "町の家計簿"
og_height = 100
scale = og_height / H
LEFT = 80
# 右に置く実画面は brand/og-card.png（ホームの決算表と入力欄を 2 倍で撮ったもの）。幅は右端まで。
CARD_X, CARD_W, CARD_H = 560, OW - 560, round((OW - 560) * 1031 / 1280)
tag_size = 40


def tagline(size: float, x: float, baseline: float) -> str:
    """見出しの下に置く一行をパス化する。字送りは advance に字間を足す。"""
    found = load_glyphs(CONFIG["font"], WEIGHT, TAGLINE)
    parts = []
    for ch in TAGLINE:
        g = found[ch]
        k = size / g["upm"]
        parts.append(f'<path transform="translate({x:.4f} {baseline:.4f}) scale({k:.5f} -{k:.5f})" d="{g["d"]}"/>')
        x += g["adv"] * k + size * 0.12
    return "".join(parts)


def og_svg(card_href: str) -> str:
    top = (OH - og_height - 36 - tag_size) / 2
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{OW}" height="{OH}" viewBox="0 0 {OW} {OH}">\n'
        f'<rect width="{OW}" height="{OH}" fill="{PAPER}"/>\n'
        f'<g fill="{INK}" transform="translate({LEFT} {top:g}) scale({scale:g})">'
        f'{mark(MARK_SCALE, MARK_X, MARK_Y)}{wordmark(TEXT_SIZE, TEXT_X, TEXT_CENTER_Y)}</g>\n'
        f'<g fill="{INK}">{tagline(tag_size, LEFT, top + og_height + 36 + tag_size * 0.88)}</g>\n'
        f'<clipPath id="c"><path d="M{CARD_X + 16} {(OH - CARD_H) / 2:g}H{OW}V{(OH + CARD_H) / 2:g}H{CARD_X + 16}'
        f'a16 16 0 0 1 -16 -16V{(OH - CARD_H) / 2 + 16:g}a16 16 0 0 1 16 -16Z"/></clipPath>\n'
        f'<image href="{card_href}" x="{CARD_X}" y="{(OH - CARD_H) / 2:g}" width="{CARD_W}" height="{CARD_H}" clip-path="url(#c)"/>\n</svg>\n'
    )


(HERE / "og.svg").write_text(og_svg("og-card.png"))
# 生成済み PNG を使う利用者や CI に、画像変換ツールを背負わせない。
# 変換側へは画像を埋め込んだ SVG を渡し、相対参照の解決に依存させない。
card = base64.b64encode((HERE / "og-card.png").read_bytes()).decode()
(HERE / ".og-render.svg").write_text(og_svg(f"data:image/png;base64,{card}"))
try:
    subprocess.run([
        "mise", "x", "imagemagick@7.1.2_27", "--", "magick", "-density", "192",
        str(HERE / ".og-render.svg"), "-resize", f"{OW}x{OH}", "-strip", f"PNG24:{PUBLIC / 'og.png'}",
    ], check=True)
    # ホームのデモ動画のサムネは、入口の通信量を抑えるため WebP にして public/ から配る。
    subprocess.run([
        "mise", "x", "imagemagick@7.1.2_27", "--", "magick", str(PUBLIC / "og.png"),
        "-quality", "80", "-define", "webp:method=6", str(HERE.parent / "public/home/demo-poster.webp"),
    ], check=True)
finally:
    (HERE / ".og-render.svg").unlink(missing_ok=True)
print("mark / wordmark / logo / favicon・logo.ts を同期、og.png を生成")
