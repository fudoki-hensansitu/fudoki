"""自治体の OG 画像（Worker が /jurisdictions/<code>/og.png で描く。server/og.ts）が使う字形を jurisdiction/og-glyphs.generated.json に書き出す。

`bun run --cwd apps/web build:og` で作り直す。Worker は書体を持たないので、ロゴと同じ書体の字形をパスにして渡す。
入れる字は、自治体マスタの名前・都道府県名・分野の名前（COFOG 大分類の言い換えと「その他」）・金額の数字と単位・固定の文言。
自治体マスタに自治体を足したとき・分野の名前を変えたときに作り直す。
"""

import csv
import json
import re
from pathlib import Path

from fonts import load_glyphs

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
CONFIG = json.loads((HERE / "config.json").read_text())
JURISDICTIONS = json.loads((ROOT / "packages/jurisdictions/jurisdictions.json").read_text())["jurisdictions"]
with (ROOT / "pipeline/dbt/seeds/jurisdiction/prefecture_master.csv").open(encoding="utf-8") as f:
    PREFECTURES = [row["prefecture_name"] for row in csv.DictReader(f)]
LABELS = re.search(r"COFOG_DIVISION_LABELS[^{]*\{([^}]*)\}", (ROOT / "packages/fiscal/cofog-master.ts").read_text()).group(1)
AREAS = re.findall(r"'\d\d': '([^']+)'", LABELS) + ["その他", "ほか"]
# server/og.ts の固定の文言と、formatYen が出す数字・単位
FIXED = "まちのお金、何に使ってる？" + "R年度に使ったお金" + "0123456789,.億万円"
OUT = HERE.parent / "jurisdiction/og-glyphs.generated.json"


def main() -> None:
    chars = set(FIXED + "".join(PREFECTURES) + "".join(AREAS) + "".join(j["name"] for j in JURISDICTIONS.values()))
    found = load_glyphs(CONFIG["font"], CONFIG["weight"], "".join(sorted(chars)))
    upm = {g["upm"] for g in found.values()}
    assert len(upm) == 1, upm
    glyphs = {ch: [g["adv"], re.sub(r"(\d+\.\d)\d+", r"\1", g["d"])] for ch, g in sorted(found.items())}
    OUT.write_text(json.dumps({"upm": upm.pop(), "glyphs": glyphs}, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"{len(glyphs)} 字を {OUT.relative_to(ROOT)} に書き出し（{OUT.stat().st_size // 1024} KB）")


if __name__ == "__main__":
    main()
