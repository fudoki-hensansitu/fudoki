"""品川区の事務事業評価シート（1小事業1頁、横置き2段組み）を読む。

語の層（`page_words`）の語を座標で拾う。左の段は基本情報・目的・指標・取組、右の段は予算・決算・財務情報・評価。
金額は千円の印字のまま返し、円への換算は呼び出し側が行う。様式の欄が見つからない頁は止める。
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

from ingestion.generic import page_words

TITLE = re.compile(r'令和\s*(\d+)年度事務事業評価シート')
ERA = 2018
GRADE = re.compile(r'^◆([ＡＢＣＤABCD])$')
# 指標の表の段の見出し（「目標」「実績」）が置かれる x の帯
INDICATOR_LABEL_X = (165, 195)
HEADER_TOKEN = re.compile(r'令和|(?:\d+|元)年度|目標')
# 右の段の始まり（A3 横の座標）
RIGHT = 600
WIDTH = 1191


@dataclass
class Indicator:
    position: int
    name: str
    unit: str | None
    definition: str | None
    # 年度（西暦）→ 印字の文字列。'target' は「目標（達成年度）」の欄
    targets: dict[str, str] = field(default_factory=dict)
    actuals: dict[str, str] = field(default_factory=dict)
    target_year_text: str | None = None


@dataclass
class Sheet:
    page: int
    evaluation_year: int
    fiscal_year: int
    name: str
    account: str | None
    kan: str | None
    kou: str | None
    moku: str | None
    jigyo: str | None
    department: str | None
    division: str | None
    budget_thousand: int | None
    settled_thousand: int | None
    grade_label: str | None
    direction: str | None
    indicators: list[Indicator]


def _norm(text: str) -> str:
    return unicodedata.normalize('NFKC', text).replace(' ', '').replace('　', '')


def _lines(words: list[dict], tolerance: float = 2.5) -> list[list[dict]]:
    rows: list[list[dict]] = []
    for word in sorted(words, key=lambda w: (w['top'], w['x0'])):
        if rows and abs(rows[-1][0]['top'] - word['top']) <= tolerance:
            rows[-1].append(word)
        else:
            rows.append([word])
    return [sorted(row, key=lambda w: w['x0']) for row in rows]


def _amount(text: str) -> int | None:
    text = _norm(text)
    if not re.fullmatch(r'-?[\d,]+', text):
        return None
    return int(text.replace(',', ''))


def _after(row: list[dict], label: str, until: tuple[str, ...] = ()) -> str | None:
    texts = [w['text'] for w in row]
    for i, text in enumerate(texts):
        if _norm(text) == label:
            out = []
            for later in texts[i + 1:]:
                if _norm(later) in until:
                    break
                out.append(later)
            return ''.join(out) or None
    return None


def read_page(page, number: int) -> Sheet | None:
    """1頁を読む。評価シートの頁でなければ None（目次など）。"""
    # 座標は A3 横（幅 1191pt）に揃える。年度によって A4 横で出ている
    scale = WIDTH / page.width
    words = [{'text': w.text, 'x0': w.x0 * scale, 'x1': w.x1 * scale, 'top': w.y0 * scale} for w in page.words]
    rows = _lines(words)
    head = _norm(''.join(w['text'] for w in rows[0])) if rows else ''
    title = TITLE.search(head)
    if not title or not any(_norm(w['text']) == '小事業名' for w in words):
        return None
    evaluation_year = ERA + int(title.group(1))
    left = [[w for w in row if w['x0'] < RIGHT] for row in rows]
    right = [r for r in ([w for w in row if w['x0'] >= RIGHT] for row in rows) if r]

    def find(rows_: list[list[dict]], label: str) -> int:
        for i, row in enumerate(rows_):
            if any(_norm(w['text']) == label for w in row):
                return i
        raise ValueError(f'p{number}: 欄「{label}」が無い')

    name_row = left[find(left, '小事業名')]
    name = _after(name_row, '小事業名')
    if not name:
        raise ValueError(f'p{number}: 小事業名が読めない')
    subject = left[find(left, '会計')]
    account = _after(subject, '会計', ('款',))
    kan = _after(subject, '款', ('項',))
    kou = _after(subject, '項')
    moku_row = left[find(left, '目')]
    moku = _after(moku_row, '目', ('事業',))
    jigyo = _after(moku_row, '事業')
    dept_row = left[find(left, '担当部署')]
    department = _after(dept_row, '担当部署', ('担当課',))
    division = _after(dept_row, '担当課', ('担当係',))
    total = next((row for row in right if row and _norm(row[0]['text']) == '計'), None)
    if total is None:
        raise ValueError(f'p{number}: 予算・決算の計の行が無い')
    amounts = [a for a in (_amount(w['text']) for w in total[1:]) if a is not None]
    budget_thousand, settled_thousand = (amounts[0], amounts[1]) if len(amounts) >= 2 else (None, None)

    final = next((i for i, row in enumerate(right) if _norm(''.join(w['text'] for w in row)) == '(2)最終評価'), None)
    if final is None:
        raise ValueError(f'p{number}: 欄「(2)最終評価」が無い')
    grade_row = grade_label = direction = None
    for row in right[final + 1:final + 4]:
        # ◆A〜◆D の印字は最終評価の行の目印にだけ使い、保存しない
        if row and GRADE.match(_norm(row[0]['text'])):
            grade_row = row
            rest = [w['text'] for w in row[1:]]
            grade_label = rest[0] if rest else None
            direction = ''.join(rest[1:]).lstrip('◆') or None
            break
    if grade_row is None:
        raise ValueError(f'p{number}: 最終評価の区分（◆A〜◆D）が読めない')

    return Sheet(number, evaluation_year, evaluation_year - 1, _norm(name), account, kan, kou, moku, jigyo,
                 department, division, budget_thousand, settled_thousand, grade_label, direction,
                 _indicators(words, number))


def _indicators(words: list[dict], number: int) -> list[Indicator]:
    left = [w for w in words if w['x0'] < RIGHT]
    header = next((w for w in left if _norm(w['text']) == '指標名'), None)
    if header is None:
        raise ValueError(f'p{number}: 指標の表が無い')
    end = next((w['top'] for w in left if _norm(w['text']) == '取組内容・実績' and w['top'] > header['top']), None)
    if end is None:
        raise ValueError(f'p{number}: 指標の表の終わりが無い')
    # 年度の見出し（「令和 4年度」…と「目標」）。語が「令和」「4年度」に割れる
    year_words = [w for w in left if header['top'] - 12 <= w['top'] < header['top'] - 2]
    # 語が「4年度令和」のようにつながることがあるので、語の中の位置を字数で割り振る
    tokens = []
    for w in year_words:
        text = _norm(w['text'])
        for match in HEADER_TOKEN.finditer(text):
            tokens.append((w['x0'] + (w['x1'] - w['x0']) * match.start() / len(text), match.group(0)))
    columns = []
    for x, text in sorted(tokens):
        if text == '令和':
            columns.append([x, None])
        elif text == '目標':
            columns.append([x - 17, 'target'])
        elif columns and columns[-1][1] is None:
            columns[-1][1] = str(ERA + (1 if text[0] == '元' else int(text[:-2])))
    columns = [(x, key) for x, key in columns if key]
    definition_x = next((w['x0'] for w in left if _norm(w['text']) == '指標の定義'), None)
    if len(columns) != 5 or definition_x is None:
        raise ValueError(f'p{number}: 指標の表の見出しが読めない {columns}')
    limit = definition_x - 56  # 指標の定義の欄の左端（見出しは欄の中ほどにある）

    body = [w for w in left if header['top'] + 10 < w['top'] < end - 2]
    labels = sorted((w for w in body if INDICATOR_LABEL_X[0] <= w['x0'] <= INDICATOR_LABEL_X[1]
                     and _norm(w['text']) in ('目標', '実績')), key=lambda w: w['top'])
    out: list[Indicator] = []
    for i in range(0, len(labels) - 1, 2):
        target, actual = labels[i], labels[i + 1]
        if _norm(target['text']) != '目標' or _norm(actual['text']) != '実績':
            raise ValueError(f'p{number}: 指標の目標と実績の段が揃わない')
        top = target['top'] - 12
        bottom = actual['top'] + 12
        block = [w for w in body if top <= w['top'] <= bottom]
        name = ''.join(w['text'] for w in sorted((w for w in block if w['x0'] < 145), key=lambda w: (round(w['top']), w['x0'])))
        unit = ''.join(w['text'] for w in block if 145 <= w['x0'] < INDICATOR_LABEL_X[0])
        definition = ''.join(w['text'] for w in sorted((w for w in block if w['x0'] >= limit), key=lambda w: (round(w['top']), w['x0'])))

        def values(label: dict) -> dict[str, str]:
            row = [w for w in block if abs(w['top'] - label['top']) <= 2.5 and label['x1'] < w['x0'] < limit]
            cells: dict[str, list[str]] = {}
            for w in row:
                key = None
                for x, column in columns:
                    if w['x1'] > x:
                        key = column
                if key:
                    cells.setdefault(key, []).append(w['text'])
            return {k: ''.join(v) for k, v in cells.items()}

        targets = values(target)
        actuals = values(actual)
        target_year_text = actuals.pop('target', None)
        if not name and not targets and not actuals:
            continue
        out.append(Indicator(len(out) + 1, _norm(name), _norm(unit) or None, _norm(definition) or None,
                             targets, actuals, target_year_text))
    return out


def read(path) -> list[Sheet]:
    sheets = []
    for page in page_words.pages(Path(path)):
        sheet = read_page(page, page.number)
        if sheet is not None:
            sheets.append(sheet)
    return sheets
