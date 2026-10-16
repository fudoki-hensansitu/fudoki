"""ホームの見出し用の明朝（BIZ UDP明朝）を、ホームで使う字だけに絞って書き出す。

閲覧者の IP を第三者へ渡さないため Google Fonts を使わず、自分で配る。標準入力にホームの HTML を受け、
public/fonts/mincho.woff2 と、Worker が配るための写し font.generated.ts を書く。
"""

import base64
import hashlib
import html
import re
import sys
import tempfile
import urllib.request
from pathlib import Path

from fontTools import subset

HERE = Path(__file__).resolve().parent
WEB = HERE.parent
ROOT = HERE.parents[2]
# 書体の出典。OFL は brand/fonts/bizudpmincho-OFL.txt
SOURCE = {
    "url": "https://raw.githubusercontent.com/google/fonts/9710da1eacb3be272583c3224dcb70f9da6eadbb/ofl/bizudpmincho/BIZUDPMincho-Regular.ttf",
    "sha256": "dbcea04578ac1e9d3484525e870ce491bd04361768f4d2ba4b827d96e20f891d",
}


def font_path() -> Path:
    cache = ROOT / ".cache/logo-fonts"
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / "BIZUDPMincho-Regular.ttf"
    if not path.exists():
        with urllib.request.urlopen(SOURCE["url"], timeout=45) as response:
            data = response.read()
        with tempfile.NamedTemporaryFile(dir=cache, delete=False) as temporary:
            temporary.write(data)
        Path(temporary.name).replace(path)
    if hashlib.sha256(path.read_bytes()).hexdigest() != SOURCE["sha256"]:
        raise ValueError("BIZ UDP明朝のハッシュが一致しません")
    return path


def page_text(page: str) -> str:
    """CSS・script・タグを除いた本文の字。どの字が明朝で組まれるかは区別せず、本文全体を収める。"""
    page = re.sub(r"<(style|script)\b.*?</\1>", "", page, flags=re.S)
    page = re.sub(r"<svg\b.*?</svg>", "", page, flags=re.S)
    return html.unescape(re.sub(r"<[^>]+>", "", page))


def main() -> None:
    text = page_text(sys.stdin.read())
    chars = sorted({c for c in text if not c.isspace()} | set("0123456789"))
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["palt", "kern", "liga"]
    options.name_IDs = ["*"]
    font = subset.load_font(str(font_path()), options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(text="".join(chars))
    subsetter.subset(font)
    out = WEB / "public/fonts/mincho.woff2"
    out.parent.mkdir(parents=True, exist_ok=True)
    subset.save_font(font, str(out), options)
    data = out.read_bytes()
    (WEB / "font.generated.ts").write_text(
        "// 生成物。brand/home_font.py が public/fonts/mincho.woff2 から書く。直接編集しない\n"
        f"export const MINCHO_WOFF2 = '{base64.b64encode(data).decode()}'\n"
    )
    print(f"{len(chars)} 字 · {len(data) // 1024} KiB → {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
