"""PWA のアイコン（public/icon-192.png・icon-512.png・icon-maskable-512.png）を favicon.svg の棒グラフから描く。
   any は余白を小さく、maskable は端が切られても欠けないよう中央の 60% に収める。assets.ts へ写すのは README の手順。
   uv run --no-project --exclude-newer 2026-10-09 --with pillow==12.3.0 python brand/pwa_icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

PUBLIC = Path(__file__).resolve().parent.parent / "public"
# BG は tokens.ts の BACKGROUND_LIGHT と揃える
BG, INK, RULE = "#ffffff", "#2f5d43", "#29523b"
# favicon.svg（32 x 32）の棒: (x, y, 幅, 高さ)。最後が下線
BARS = [(2, 14, 4, 14), (8, 6, 4, 22), (14, 18, 4, 10), (20, 2, 4, 26), (26, 11, 4, 17)]
RULE_BAR = (2, 29, 28, 2)


def render(size: int, mark: float) -> Image.Image:
    scale = 4
    s = size * scale
    img = Image.new("RGB", (s, s), BG)
    d = ImageDraw.Draw(img)
    unit = s * mark / 32
    off = (s - 32 * unit) / 2
    for (x, y, w, h), fill in [(b, INK) for b in BARS] + [(RULE_BAR, RULE)]:
        d.rounded_rectangle([off + x * unit, off + y * unit, off + (x + w) * unit, off + (y + h) * unit], radius=min(w, h) / 2 * unit, fill=fill)
    return img.resize((size, size), Image.LANCZOS)


for name, size, mark in [("icon-192.png", 192, 0.62), ("icon-512.png", 512, 0.62), ("icon-maskable-512.png", 512, 0.5)]:
    render(size, mark).save(PUBLIC / name, optimize=True)
    print(name)
