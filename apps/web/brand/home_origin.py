"""ホームの「確かめる」に載せる原典の切り抜きを、新宿区の決算書 PDF から書き出す。

原典は自治体が公開した PDF そのもの。頁と切り抜く範囲（pt）は home-data.ts の HOME.origin と揃える。
static/home/origin.webp を書く（Worker の static assets として配る）。
"""

import hashlib
import io
import tempfile
import urllib.request
from pathlib import Path

import pypdfium2
from PIL import Image

HERE = Path(__file__).resolve().parent
WEB = HERE.parent
ROOT = HERE.parents[2]
SOURCE = {
    "url": "https://www.city.shinjuku.lg.jp/content/000465173.pdf",
    "sha256": "ca3f8658f6dbe295978db484227ec1c7adbdc15eeb136f109fa406798511c1eb",
}
# PDF の頁（1始まり）と切り抜く範囲 [x0, y0, x1, y1]（pt、左上原点）。home-data.ts の HOME.origin と同じ値
PAGE = 143
CROP = (10.0, 52.0, 722.0, 345.0)
SCALE = 3


def pdf_path() -> Path:
    cache = ROOT / ".cache/home-origin"
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / "shinjuku-R7kessan.pdf"
    if not path.exists():
        with urllib.request.urlopen(SOURCE["url"], timeout=120) as response:
            data = response.read()
        with tempfile.NamedTemporaryFile(dir=cache, delete=False) as temporary:
            temporary.write(data)
        Path(temporary.name).replace(path)
    if hashlib.sha256(path.read_bytes()).hexdigest() != SOURCE["sha256"]:
        raise ValueError("新宿区の決算書のハッシュが一致しません")
    return path


def main() -> None:
    page = pypdfium2.PdfDocument(str(pdf_path()))[PAGE - 1]
    image = page.render(scale=SCALE).to_pil().convert("L")
    x0, y0, x1, y1 = (round(v * SCALE) for v in CROP)
    image = image.crop((x0, y0, x1, y1))
    buffer = io.BytesIO()
    image.save(buffer, "WEBP", quality=72, method=6)
    data = buffer.getvalue()
    out = WEB / "static/home/origin.webp"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)
    print(f"{image.width}x{image.height} · {len(data) // 1024} KiB → {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
