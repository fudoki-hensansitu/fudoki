"""事務事業評価シートを、宣言（`workflow`）の正規表現で読む。1枚（1事業）が1件。

頁の文字（bbox の語を `page_words.lines` で行に組んだもの）を NFKC にして行ごとに空白を1つに詰め、字の間を空けて組んだ語（「事 務 事 業 名」）を詰め、宣言の正規表現の名前付きの組で欄を拾う。
事業名が折り返して文字の順が崩れる様式は `rows`（字の位置）で読み、型に収まらない自治体（品川）は `layouts/<自治体>_sheet.py` で読む。

宣言の形:

    "workflow": {
      "page": "事務事業評価シート",          # この語が無い頁は読まない（表紙・目次・一覧）
      "start": "事務事業名称",              # 任意。シートが複数頁に続く様式で、1枚目の頁に当たる語。無ければ1頁1枚。
                                            # 続きの頁も `page` には当たる必要がある
      "skip": "施策評価シート",             # 任意。当たる頁は読まない
      "fields": ["事務事業名称 (?P<name>.+?) 款 (?P<kan_code>\\d+)", ...],
      "unit": "千円",                       # budget・settled の単位（千円 既定、円）。欄で違えば {"budget": "千円", "settled": "円"}
      "item": "^事業名称 ",                 # 任意。1枚に複数の事業を並べる様式で、事業ごとの先頭の行に当たる語。
                                            # 当たる行から次に当たる行の前までを1件にし、最初に当たる行より前（見出し）は各件の後ろに足す
    }

CSV の評価（1行1事業）は `columns` に組の名前 → 列の見出しを書き、行の順を頁の番号の代わりにする（見出しの行の次が1）:

    "workflow": {"columns": {"name": "事務事業名", "division": "担当部課", "grade": "令和７年度評価"}}

列の見出しを並べると、空でない最初の列を使う。`{"column": 見出し, "pattern": 正規表現}` は最初の括弧に当たる部分
だけを取る（例: 番号つきの検索キー `{"column": "事務事業名（検索キー）", "pattern": "^\\d+ (.+)$"}`）。

字の位置で読む様式（1行1事業の表、事業名が折り返す票）は `rows` に、事業ごとに1つ印字される錨の語と、錨からの位置の枠を書く:

    "rows": {
      "anchor": {"x": [24, 37], "pattern": "^\\d+$", "below": "^事務事業名$"},  # 語の中心の x の範囲と語の正規表現。
                                            # `below` があれば、それに当たる語より下の錨だけを使う
      "fields": {"name": {"x": [37, 112], "y": [-24, 24]},    # 錨の上端からの y の範囲。枠の語を上の行から順につなぐ
                 "settled": {"x": [470, 525], "y": [-3, 3], "pattern": "^([\\d,]+)$"},  # 最初の括弧に当たる部分を採る
                 "codes": {"from": "^業務量", "x": [40, 240], "y": [-3, 3],
                           "pattern": "^(?P<kan_code>\\d+) (?P<kou_code>\\d+)"}}  # 名前付きの組はその組の名前で採る
    }

`ignore` に当たる語は枠に入れない（枠にかかる事業番号など）。`cut` が真の欄は、欄の境をまたぐ語を字の幅を等分に見て欄の中の字だけにする（OCR が隣の欄の語とつないだ行）。
`from` は欄ごとの基準の語（錨の上で最も近い語）、`before` はそれに当たる語の行から下を枠から外す。
`skip`（枠の list）のどれかに当たる行は読まず、`distinct` が真なら事業名・所管課・金額が同じ2つ目からの行を読まない。
座標は `page_words` の語の座標。頁の文字の `fields` は枠で拾えなかった組を埋め、`carry_fields` は見出しの頁で拾った組を
次に当たる頁まで後ろの頁へ引き継ぐ。1冊に様式の違う部分があれば `parts` に宣言を並べ、それぞれで読んだものを合わせる。

文字の層の無い・字形の壊れた冊は、宣言の `ocr` に依頼を書くと OCR の観測の行を語にして読む（`ocr.py`）。チェックの印
（✔）は OCR が読まないので、選択肢の語に当たる `marks.pattern` と、語の左端からの箱の x の範囲 `marks.x` を書くと、
箱に墨（黒い画素の割合が `marks.ink`、既定 0.05 以上）のある語の頭に ✔ を足す: `"marks": {"pattern": "^(計画どおり|拡充)$", "x": [-11, -2]}`。

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
import statistics
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

from ingestion.generic import page_words

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
    position: int = 1
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
    return [Path(__file__), Path(__file__).with_name('ocr.py')]


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


def match(text: str, fields: list) -> tuple[dict[str, str], dict[str, str]]:
    """宣言の正規表現で欄を拾う。組の名前 → 値と、単位を変えた金額の組 → 単位を返す。"""
    found: dict[str, str] = {}
    units: dict[str, str] = {}
    for field_ in fields:
        pattern = field_ if isinstance(field_, str) else field_['pattern']
        hit = re.search(pattern, text, re.M)
        if not hit:
            continue
        values = hit.groupdict()
        for key, value in values.items():
            if key.endswith('_more'):
                continue
            if key not in GROUPS:
                raise ValueError(f'組の名前が違う: {key}')
            if key not in found and clean(value) is not None:
                found[key] = clean(value) + (clean(values.get(f'{key}_more')) or '')
                if key in ('budget', 'settled') and not isinstance(field_, str) and 'unit' in field_:
                    units[key] = field_['unit']
    return found, units


def build(found: dict[str, str], number: int, workflow: dict, position: int = 1, units: dict[str, str] | None = None) -> Sheet | None:
    unit = workflow.get('unit', '千円')
    units = {**(unit if isinstance(unit, dict) else {'budget': unit, 'settled': unit}), **(units or {})}
    found = dict(found)
    if 'name' not in found:
        print(f'p{number}: 事業名が読めないので読まない', file=sys.stderr)
        return None
    grade = found.pop('grade', None)
    budget, settled = found.pop('budget', None), found.pop('settled', None)
    return Sheet(page=number, position=position, **found, budget_yen=amount(budget, units['budget']), settled_yen=amount(settled, units['settled']),
                 grade_label=grade)


def parse(text: str, number: int, workflow: dict, position: int = 1) -> Sheet | None:
    found, units = match(text, workflow['fields'])
    return build(found, number, workflow, position, units)


# 字の間を空けて組んだ語（「事 務 事 業 名」）。1字ずつの全角が3字以上、空白1つずつで並ぶ
SPACED = re.compile(r'(?<!\S)(?:[^\x00-\x7f\s] ){2,}[^\x00-\x7f\s](?!\S)')


def unspace(text: str) -> str:
    """字の間を空けて組んだ語を詰める（「事 務 事 業 名」→「事務事業名」）。"""
    return SPACED.sub(lambda m: m.group(0).replace(' ', ''), text)


def word_pages(path, ocr: list | None = None, marks: dict | None = None) -> list:
    """頁の語。OCR で読む冊（`ocr.py`）は観測の行の箱、ほかは bbox（`page_words`）の語。"""
    out = ocr if ocr is not None else page_words.pages(Path(path))
    return [mark(path, page, marks) for page in out] if marks else out


def mark(path, page, marks: dict):
    """選択肢の左の箱に墨があれば、その語の頭に ✔ を足す。スキャンでは OCR がチェックの印を読まないので、
    頁の画像の箱（語の左端からの x の範囲 `marks.x`、語の高さ）の黒い画素の割合で決める。"""
    targets = [word for word in page.words if re.search(marks['pattern'], unicodedata.normalize('NFKC', word.text))]
    if not targets:
        return page
    import numpy
    import pypdfium2

    scale = 4
    document = pypdfium2.PdfDocument(str(path))
    try:
        image = numpy.asarray(document[page.number - 1].render(scale=scale).to_pil().convert('L')) < 128
    finally:
        document.close()
    lo, hi = marks['x']

    def inked(word) -> bool:
        # OCR の箱が印の箱まで含むことがあるので、同じ列の選択肢の左端の中央値を語の左端にする
        left = statistics.median(other.x0 for other in targets if abs(other.x0 - word.x0) <= 15)
        box = image[int((word.y0 + 1) * scale):int((word.y1 - 1) * scale), int((left + lo) * scale):int((left + hi) * scale)]
        return box.size > 0 and box.mean() >= marks.get('ink', 0.05)

    words = [page_words.Word(f'✔{word.text}', word.x0, word.y0, word.x1, word.y1) if word in targets and inked(word) else word
             for word in page.words]
    return page_words.Page(page.number, page.width, page.height, words)


def pages(path, ocr: list | None = None, marks: dict | None = None) -> list[tuple[int, str]]:
    """頁ごとの文字。語を行に組み、行ごとに空白を1つに詰め、字の間を空けた語を詰める。"""
    return [(page.number, unspace(norm('\n'.join(page_words.lines(page))))) for page in word_pages(path, ocr, marks)]


def read_csv(path, workflow: dict) -> list[Sheet]:
    """CSV の評価を読む。1行が1事業で、行の順（見出しの次の行が1）を頁の番号にする。金額の列は読まない。"""
    import csv
    columns = workflow['columns']
    if unknown := set(columns) - (set(GROUPS) - {'budget', 'settled'}):
        raise ValueError(f'組の名前が違う（CSV は金額を読まない）: {sorted(unknown)}')
    with open(path, encoding='utf-8-sig', newline='') as f:
        rows = list(csv.DictReader(f))
    specs = {key: [{'column': c} if isinstance(c, str) else c for c in (spec if isinstance(spec, list) else [spec])]
             for key, spec in columns.items()}
    if rows and (missing := {c['column'] for cs in specs.values() for c in cs} - set(rows[0])):
        raise ValueError(f'CSV に列が無い: {sorted(missing)}')

    def cell(row, spec):
        value = clean(unicodedata.normalize('NFKC', row[spec['column']] or '')) or ''
        if 'pattern' in spec:
            value = (m.group(1) if (m := re.search(spec['pattern'], value)) else '').strip()
        # 「―」だけの欄は空にする
        return None if re.fullmatch(r'[―ー-]*', value) else value

    sheets, unnamed = [], 0
    for number, row in enumerate(rows, 1):
        found = {key: next(filter(None, (cell(row, c) for c in cs)), None) for key, cs in specs.items()}
        if not found.get('name'):
            unnamed += 1
            continue
        grade = found.pop('grade', None)
        sheets.append(Sheet(page=number, **{k: v for k, v in found.items() if v is not None}, grade_label=grade))
    if unnamed:
        print(f'{Path(path).name}: 事業名の無い {unnamed} 行は読まない', file=sys.stderr)
    return sheets


def read(path, workflow: dict, ocr: list | None = None) -> list[Sheet]:
    """シートの頁を読む。`start` があれば、1枚目の頁から次の1枚目の前までを1枚にする。`ocr` は OCR の観測の頁。"""
    if 'parts' in workflow:
        return [sheet for part in workflow['parts'] for sheet in read(path, part, ocr)]
    if 'columns' in workflow:
        return read_csv(path, workflow)
    if 'rows' in workflow:
        return read_rows(path, workflow, ocr)
    groups: list[tuple[int, list[str]]] = []
    texts = pages(path, ocr, workflow.get('marks'))
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
    sheets = (sheet for number, texts in groups for sheet in parse_items('\n'.join(texts), number, workflow))
    return [sheet for sheet in sheets if sheet is not None]


def parse_items(text: str, number: int, workflow: dict) -> list[Sheet | None]:
    """1枚を読む。`item` があれば事業ごとに分け、頁の中の順（position）を付ける。"""
    if 'item' not in workflow:
        return [parse(text, number, workflow)]
    starts = [m.start() for m in re.finditer(workflow['item'], text, re.M)]
    if not starts:
        return []
    header = text[:starts[0]]
    chunks = [text[a:b] for a, b in zip(starts, [*starts[1:], len(text)])]
    return [parse(f'{chunk}\n{header}', number, workflow, position) for position, chunk in enumerate(chunks, 1)]


def join(words: list) -> str:
    """枠の中の語を、行（上から）と行の中（左から）の順につなぐ。半角の字どうしの間だけ空白を置く。"""
    lines: list[list] = []
    for word in sorted(words, key=lambda w: (w.y0, w.x0)):
        if lines and abs(lines[-1][0].y0 - word.y0) <= (word.y1 - word.y0) * page_words.SAME_LINE:
            lines[-1].append(word)
        else:
            lines.append([word])
    out = ''
    for word in (word for line in lines for word in sorted(line, key=lambda w: w.x0)):
        text = unicodedata.normalize('NFKC', word.text)
        if out and out[-1].isascii() and text[:1].isascii():
            out += ' '
        out += text
    return out


def inside(word, anchor, spec: dict) -> bool:
    x0, x1 = spec['x']
    y0, y1 = spec.get('y', (-2, 2))
    return x0 <= (word.x0 + word.x1) / 2 <= x1 and y0 <= word.y0 - anchor.y0 <= y1


def cut(word, x: list):
    """欄の境をまたぐ語（OCR が隣の欄の語とつないだ行）を、字の幅を等分に見て欄の中の字だけにする。"""
    text = word.text
    width = (word.x1 - word.x0) / max(len(text), 1)
    keep = [i for i in range(len(text)) if x[0] <= word.x0 + (i + 0.5) * width <= x[1]]
    if not keep:
        return None
    if len(keep) == len(text):
        return word
    return page_words.Word(text[keep[0]:keep[-1] + 1], word.x0 + keep[0] * width, word.y0, word.x0 + (keep[-1] + 1) * width, word.y1)


def region(words: list, anchor, spec: dict) -> dict[str, str] | str | None:
    """枠の語をつないだ文字。`pattern` に名前付きの組があれば、組の名前 → 値を返す。"""
    if 'from' in spec:
        # 欄ごとの基準の語（錨の上で最も近い語、上に無ければ縦で最も近い語）からの位置にする
        refs = [word for word in words if re.search(spec['from'], unicodedata.normalize('NFKC', word.text))]
        if not refs:
            return None
        above = [word for word in refs if word.y0 <= anchor.y0 + 2]
        anchor = max(above, key=lambda word: word.y0) if above else min(refs, key=lambda word: abs(word.y0 - anchor.y0))
    # `cut` の欄は境をまたぐ語を切ってから枠に入れる（`before` は切る前の語で見る）
    if 'ignore' in spec:
        # 枠にかかる別の欄の語（事業番号など）は `ignore` に当たれば入れない
        words = [word for word in words if not re.search(spec['ignore'], unicodedata.normalize('NFKC', word.text))]
    pieces = [cut(word, spec['x']) for word in words] if spec.get('cut') else words
    found = [word for word in pieces if word is not None and inside(word, anchor, spec)]
    if 'before' in spec:
        # 錨より下で `before` に当たる最初の語の行から下は枠に入れない（折り返しの行数が欄ごとに違う様式）。
        # 基準の語（`from`）からの枠では、基準の語の行は数えず、次の区画の見出しから下を外す
        floor = anchor.y0 + 2 if 'from' in spec else anchor.y0 - 2
        stops = [word.y0 for word in words if word.y0 > floor and re.search(spec['before'], unicodedata.normalize('NFKC', word.text))]
        if stops:
            found = [word for word in found if word.y0 < min(stops) - 2]
    text = clean(join(found))
    if text is None or 'pattern' not in spec:
        return text
    hit = re.search(spec['pattern'], text)
    if hit and hit.groupdict():
        return {key: value for key, value in hit.groupdict().items() if clean(value) is not None}
    return clean(hit.group(1) if hit and hit.groups() else hit.group(0) if hit else None)


def read_rows(path, workflow: dict, ocr: list | None = None) -> list[Sheet]:
    """座標で読む。`rows.anchor` に当たる語ごとに1事業とし、欄は錨の語からの位置の枠の語をつないで拾う。
    `fields`（頁の文字の正規表現）があれば、枠で拾えなかった組をそれで埋める（所管課の見出しなど）。"""
    rows = workflow['rows']
    sheets: list[Sheet] = []
    carried: dict[str, str] = {}
    for page in word_pages(path, ocr, workflow.get('marks')):
        text = unspace(norm('\n'.join(page_words.lines(page))))
        # 見出しの頁にだけ印字した欄（所管課など）は `carry_fields` で拾い、次に当たる頁まで後ろの頁へ引き継ぐ
        carried.update(match(text, workflow.get('carry_fields', []))[0])
        if 'skip' in workflow and re.search(workflow['skip'], text, re.M):
            continue
        if not re.search(workflow['page'], text, re.M):
            continue
        header, units = match(text, workflow.get('fields', []))
        header = {**carried, **header}
        spec = rows['anchor']
        anchors = sorted((word for word in page.words if spec['x'][0] <= (word.x0 + word.x1) / 2 <= spec['x'][1]
                          and re.search(spec['pattern'], unicodedata.normalize('NFKC', word.text))), key=lambda w: (w.y0, w.x0))
        if 'below' in spec:
            # 表の見出し（`below`）より下の錨だけを使う（同じ欄に節の番号などが並ぶ頁）
            heads = [word.y0 for word in page.words if re.search(spec['below'], unicodedata.normalize('NFKC', word.text))]
            anchors = [word for word in anchors if heads and word.y0 > min(heads)]
        for position, anchor in enumerate(anchors, 1):
            # 別の欄に載る事業を指す行（「金額については…に記載」）は `skip` の枠に当たれば読まない
            if any(region(page.words, anchor, field_) is not None for field_ in rows.get('skip', [])):
                continue
            found: dict[str, str] = {}
            for key, field_ in rows['fields'].items():
                value = region(page.words, anchor, field_)
                # 名前付きの組で拾った欄は、その組の名前で入れる（欄の名前は見出しにすぎない）
                for group, text in (value.items() if isinstance(value, dict) else [(key, value)] if value is not None else []):
                    found.setdefault(group, clean(text))
            if unknown := set(found) - set(GROUPS):
                raise ValueError(f'組の名前が違う: {sorted(unknown)}')
            if sheet := build({**header, **found}, page.number, workflow, position, units):
                sheets.append(sheet)
    if rows.get('distinct'):
        # 同じ事業を複数の施策・課題の下に重ねて載せる冊は、事業名・所管課・金額が同じ2つ目からを読まない
        seen: set[tuple] = set()
        sheets = [sheet for sheet in sheets if (key := (sheet.name, sheet.division, sheet.budget_yen, sheet.settled_yen)) not in seen
                  and not seen.add(key)]
    return sheets
