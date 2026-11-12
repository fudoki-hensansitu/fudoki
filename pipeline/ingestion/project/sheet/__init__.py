"""事務事業評価シートを、宣言（`workflow`）の正規表現で読む。1枚（1事業）が1件。

頁の文字（`pdftotext -layout`）を NFKC にして行ごとに空白を1つに詰め（空の行は残る。行をまたぐ正規表現は `\\n+` にする）、宣言の正規表現の名前付きの組で欄を拾う。座標は使わない。
様式が座標でしか読めない自治体（品川）は `layouts/<自治体>_sheet.py` で読む。

宣言の形:

    "workflow": {
      "page": "事務事業評価シート",          # この語が無い頁は読まない（表紙・目次・一覧）
      "start": "事務事業名称",              # 任意。シートが複数頁に続く様式で、1枚目の頁に当たる語。無ければ1頁1枚。
                                            # 続きの頁も `page` には当たる必要がある
      "skip": "施策評価シート",             # 任意。当たる頁は読まない
      "fields": ["事務事業名称 (?P<name>.+?) 款 (?P<kan_code>\\d+)", ...],
      "unit": "千円",                       # budget・settled の単位（千円 既定、円）。欄で違えば {"budget": "千円", "settled": "円"}
    }

評価の区分の印字（grade）は grade_label にそのまま残す。共通の区分は付けず、今後の方向性の区分（direction_code）を
入力準備で当てる（`DIRECTIONS`・宣言の `directions`）。A〜D のような4区分は API が方向性の区分からまとめる。

`fields` の組の名前: name（必須）・account・kan・kou・moku・jigyo（科目の名前）・kan_code・kou_code・moku_code・
jigyo_code（科目の番号）・department・division・budget（予算現額）・settled（決算額）・grade（評価の区分）・
direction（今後の方向性）。`<名前>_more` の組は、名前が折り返して離れた行に続くときの続きで、`<名前>` の後ろに足す。
同じ名前の組は先に当たった正規表現の値を採る。`fields` の要素は `{"pattern": "...", "unit": "円"}` とも書け、
その正規表現で拾った金額だけ単位を変える（様式の違う頁が混ざる冊）。正規表現は複数行（re.M）で、
行をまたぐときは `[\\s\\S]*?` を使う。
"""
from __future__ import annotations

import re
import subprocess
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

from ingestion.lib import poppler

GROUPS = ('name', 'account', 'kan', 'kou', 'moku', 'jigyo', 'kan_code', 'kou_code', 'moku_code', 'jigyo_code',
          'department', 'division', 'budget', 'settled', 'grade', 'direction')
UNITS = {'千円': 1000, '円': 1}

# 今後の方向性の印字を風土記の共通の区分（direction_code）に当てる既定の正規表現。上から順に試し、最初に当たったものにする。
# 宣言の `directions` で自治体ごとの当て方を前に足せる（記号だけの様式など）。どれにも当たらなければ空。
DIRECTIONS = {
    '新規': 'new',
    '廃止等に向けた検討': 'consider_end',
    '法定受託|法定扶助': 'statutory',
    '計画・規定どおり': 'as_planned',
    '一部廃止': 'reduce',
    '統合|移管': 'merge',
    '完了|終了|完成': 'complete',
    '廃止|休止': 'end',
    '縮小': 'reduce',
    '対象・規模等の見直し|^対象の見直し$': 'resize',
    '改善|見直|再編|手法': 'improve',
    '拡大|拡充|重点的に推進': 'expand',
    '現状維持|維持|継続|変更なし|推進': 'keep',
}
DIRECTION_CODES = ('new', 'expand', 'keep', 'statutory', 'as_planned', 'improve', 'resize', 'reduce', 'merge',
                   'complete', 'end', 'consider_end')


def direction_code(text: str | None, overrides: dict[str, str] | None = None) -> str | None:
    """今後の方向性の印字を共通の区分にする。宣言の当て方（overrides）を先に試す。"""
    if not text:
        return None
    for pattern, code in {**(overrides or {}), **DIRECTIONS}.items():
        if re.search(pattern, text):
            if code not in DIRECTION_CODES:
                raise ValueError(f'方向性の区分が違う: {code}')
            return code
    return None


@dataclass
class Sheet:
    page: int
    name: str
    account: str | None = None
    kan: str | None = None
    kou: str | None = None
    moku: str | None = None
    jigyo: str | None = None
    kan_code: str | None = None
    kou_code: str | None = None
    moku_code: str | None = None
    jigyo_code: str | None = None
    department: str | None = None
    division: str | None = None
    budget_yen: int | None = None
    settled_yen: int | None = None
    grade_label: str | None = None
    direction: str | None = None
    indicators: list = field(default_factory=list)


def modules() -> list[Path]:
    return [Path(__file__)]


def norm(text: str) -> str:
    text = unicodedata.normalize('NFKC', text)
    return '\n'.join(re.sub(r'[ \t　]+', ' ', line).strip() for line in text.splitlines())


def amount(text: str | None, unit: str) -> int | None:
    """印字の金額を円にする。▲・△ は負。数が無ければ None。"""
    if text is None:
        return None
    text = text.replace(',', '').replace(' ', '')
    sign = -1 if text[:1] in '▲△-' and len(text) > 1 else 1
    digits = re.sub(r'^[▲△-]', '', text)
    if not re.fullmatch(r'\d+(?:\.\d+)?', digits):
        return None
    return round(sign * float(digits) * UNITS[unit])


def clean(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.replace('\n', '').strip()
    return value or None


def parse(text: str, number: int, workflow: dict) -> Sheet | None:
    unit = workflow.get('unit', '千円')
    units = unit if isinstance(unit, dict) else {'budget': unit, 'settled': unit}
    found: dict[str, str] = {}
    for field_ in workflow['fields']:
        pattern = field_ if isinstance(field_, str) else field_['pattern']
        match = re.search(pattern, text, re.M)
        if not match:
            continue
        values = match.groupdict()
        for key, value in values.items():
            if key.endswith('_more'):
                continue
            if key not in GROUPS:
                raise ValueError(f'組の名前が違う: {key}')
            if key not in found and clean(value) is not None:
                found[key] = clean(value) + (clean(values.get(f'{key}_more')) or '')
                if key in ('budget', 'settled') and not isinstance(field_, str) and 'unit' in field_:
                    units = {**units, key: field_['unit']}
    if 'name' not in found:
        print(f'p{number}: 事業名が読めないので読まない', file=sys.stderr)
        return None
    grade = found.pop('grade', None)
    budget, settled = found.pop('budget', None), found.pop('settled', None)
    return Sheet(page=number, **found, budget_yen=amount(budget, units['budget']), settled_yen=amount(settled, units['settled']),
                 grade_label=grade)


def pages(path) -> list[tuple[int, str]]:
    """頁ごとの文字。mise で固定した Poppler の `pdftotext -layout` で、段の並びを保ったまま行にする。"""
    poppler.require()
    text = subprocess.run(['pdftotext', '-layout', '-enc', 'UTF-8', str(path), '-'],
                          capture_output=True, check=True).stdout.decode('utf-8')
    return [(number, norm(page)) for number, page in enumerate(text.split('\f')[:-1] or [''], start=1)]


def read(path, workflow: dict) -> list[Sheet]:
    """シートの頁を読む。`start` があれば、1枚目の頁から次の1枚目の前までを1枚にする。"""
    groups: list[tuple[int, list[str]]] = []
    texts = pages(path)
    if not any(text.strip() for _, text in texts):
        print(f'{Path(path).name}: 文字の層が無い（スキャン）ので読まない', file=sys.stderr)
    for number, text in texts:
        if 'skip' in workflow and re.search(workflow['skip'], text, re.M):
            continue
        if not re.search(workflow['page'], text, re.M):
            continue
        if 'start' not in workflow or re.search(workflow['start'], text, re.M):
            groups.append((number, [text]))
        elif groups:
            groups[-1][1].append(text)
    sheets = (parse('\n'.join(texts), number, workflow) for number, texts in groups)
    return [sheet for sheet in sheets if sheet is not None]
