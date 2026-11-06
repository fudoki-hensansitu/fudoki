"""PNG のアイコン（favicon.ico・icon.png・apple-touch-icon.png・PWA の icon-192/512・maskable）を区画のマークから描く。
   any は余白を小さく、maskable は端が切られても欠けないよう中央の 60% に収める。public/ に置けば Workers static assets がそのまま配る。
   uv run --no-project --exclude-newer 2026-10-09 --with pillow==12.3.0 python brand/pwa_icons.py"""
import json
from pathlib import Path
from PIL import Image, ImageDraw

from geometry import PARCELS, RADIUS

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parent / "public"
CONFIG = json.loads((HERE / "config.json").read_text())
# BG は tokens.ts の BACKGROUND_LIGHT と揃える
BG, INK, ACCENT = "#ffffff", CONFIG["ink"], CONFIG["accent"]


def render(size: int, mark: float, mode: str = "RGB") -> Image.Image:
    scale = 4
    s = size * scale
    img = Image.new(mode, (s, s), BG)
    d = ImageDraw.Draw(img)
    unit = s * mark / 28
    off = s / 2 - 16 * unit
    for x, y, w, h, accent in PARCELS:
        d.rounded_rectangle([off + x * unit, off + y * unit, off + (x + w) * unit, off + (y + h) * unit],
                            radius=RADIUS * unit, fill=ACCENT if accent else INK)
    return img.resize((size, size), Image.LANCZOS)


for name, size, mark in [("icon-192.png", 192, 0.62), ("icon-512.png", 512, 0.62), ("icon-maskable-512.png", 512, 0.5),
                         ("apple-touch-icon.png", 180, 0.62)]:
    render(size, mark).save(PUBLIC / name, optimize=True)
    print(name)
render(256, 0.8, "RGBA").save(PUBLIC / "icon.png", optimize=True)
# タブの小さい表示では余白を詰め、16px でも区画の空きが潰れないようにする
render(48, 0.9, "RGBA").save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
print("icon.png / favicon.ico")
