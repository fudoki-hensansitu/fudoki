"""予算案のプレス発表を、工程ごとのパターンの組み合わせ（宣言の `workflow`）で読む。

工程は4つ。どの自治体も同じ順に通す。

1. どこを読むか（`scope`）: `page` に当たる頁だけを読む。`start` に当たる行の次から `end` に当たる行の前までを読む（頁をまたぐ）
2. 件の見つけ方（`find`）: パターンを1つ選ぶ。`find/lines.py`（行）・`find/table.py`（表の行）・`find/card.py`（札）
3. 名前と金額の組み立て（`assemble`）: パターンを順に足す（無くてよい）。`assemble/<名前>.py`
4. 札と説明（`marks`）: 新規の印・名前から除く部分・説明・別名・読まない件

宣言の形:

    "workflow": {
      "scope": {"start": "...", "end": "...", "page": "..."},
      "find": {"pattern": "lines", "options": {...}},
      "assemble": [{"pattern": "amount_next", "options": {...}}],
      "marks": {"new": ["新規"], "strip": "...", "point": "...", "skip": "..."}
    }

`marks` のキー:

- `new`: 新規を表す札の値の list（`new_contains` が true なら札に含まれれば新規）。`new_mark`: 名前に当たれば新規にし、名前から除く
- `tag`: 名前の中の札（組 `tag`）。当たった部分を名前から除く
- `strip`: 名前から除く部分
- `point`: 名前の中の説明（組 `point`、「事業名(説明)」の括弧など）。名前から除いて points にする
- `also`: 名前の中の別名（組 `also`、予算書の事業名など）。名前から除いて names に足す。`also_skip` に当たる別名は足さない
- `skip`: 名前に当たる件は読まない。`unique`: 同じ名前は最初の1件だけにする
- `require_amount`: 金額の無い件を読まない（既定 false）。`"untagged"` なら金額も札も無い件だけ読まない
- `no_amount`: この札の件は金額を持たない（廃止の事業に前年度の額だけを印字する様式）
- `unit`: 数だけの金額の単位（`千円` 既定、`百万円`）

パターンは選んだものだけが読み方の指紋に入る（`modules`）。パターンを直しても、選んでいない自治体のキャッシュは古くならない。
"""
from __future__ import annotations

import importlib
import re
from dataclasses import dataclass, field
from pathlib import Path

from ingestion.generic import page_words
from ingestion.project.layouts.press import PressItem, amount, norm


@dataclass
class Candidate:
    """件の見つけ方が返す1件。index は頁の行（scope の中）の位置で、行で見つけたときだけ持つ。"""
    page: int
    name: str
    amount: str | None = None
    tag: str | None = None
    points: list[str] = field(default_factory=list)
    names: list[str] = field(default_factory=list)
    is_new: bool = False
    index: int | None = None


@dataclass
class Page:
    """件の見つけ方と組み立てに渡す頁。rows は scope の中の行。is_item は行が件の始まりか（行で見つけるときだけ）。"""
    number: int
    page: object
    rows: list[str]
    is_item: object = None


def pattern(stage: str, name: str):
    return importlib.import_module(f'ingestion.project.press.{stage}.{name}')


def modules(workflow: dict) -> list[Path]:
    """読み方の指紋に入れるファイル。この工程の組み立てと、選んだパターンだけ。"""
    chosen = [pattern('find', workflow['find']['pattern'])]
    chosen += [pattern('assemble', step['pattern']) for step in workflow.get('assemble', [])]
    return [Path(__file__), *(Path(m.__file__) for m in chosen)]


def finish(candidate: Candidate, marks: dict) -> Candidate | None:
    """札と説明。読まない件は None。"""
    name = candidate.name
    if 'tag' in marks:
        marked = re.search(marks['tag'], name)
        if marked:
            candidate.tag, name = marked.group('tag'), name[:marked.start()] + name[marked.end():]
    new = marks.get('new', [])
    is_new = candidate.is_new or (any(w in (candidate.tag or '') for w in new) if marks.get('new_contains')
                                  else candidate.tag in new)
    if 'new_mark' in marks and re.search(marks['new_mark'], name):
        is_new, name = True, re.sub(marks['new_mark'], '', name)
    if 'strip' in marks:
        name = re.sub(marks['strip'], '', name)
    points = list(candidate.points)
    if 'point' in marks:
        described = re.search(marks['point'], name)
        if described:
            name, points = name[:described.start()] + name[described.end():], [described.group('point')]
    names = list(candidate.names)
    if 'also' in marks:
        found = re.search(marks['also'], name)
        if found:
            name = name[:found.start()] + name[found.end():]
            if not ('also_skip' in marks and re.search(marks['also_skip'], found.group('also'))):
                names.append(found.group('also'))
    name = name.strip()
    if 'skip' in marks and re.search(marks['skip'], name):
        return None
    required = marks.get('require_amount')
    if required and not candidate.amount and (required is True or not candidate.tag):
        return None
    if candidate.tag in marks.get('no_amount', []):
        candidate.amount = None
    candidate.name, candidate.is_new, candidate.points, candidate.names = name, is_new, points, names
    return candidate


def read(path, workflow: dict) -> list[PressItem]:
    """頁の行は bbox（`page_words`）から組む。表・札で見つける様式だけ、罫線と字の位置を pdfplumber の頁で読む。"""
    scope, marks = workflow.get('scope', {}), workflow.get('marks', {})
    finder = pattern('find', workflow['find']['pattern'])
    options = workflow['find'].get('options', {})
    steps = [(pattern('assemble', s['pattern']), s.get('options', {})) for s in workflow.get('assemble', [])]
    start = re.compile(scope['start']) if 'start' in scope else None
    end = re.compile(scope['end']) if 'end' in scope else None
    page_text = re.compile(scope['page']) if 'page' in scope else None
    state = finder.State(options) if hasattr(finder, 'State') else None
    items: list[PressItem] = []
    inside, stopped = start is None, False
    pdf = None
    if getattr(finder, 'NEEDS_PAGE', False):
        import pdfplumber
        pdf = pdfplumber.open(path)
    try:
        for words in page_words.pages(Path(path)):
            number = words.number
            lines = [norm(r) for r in page_words.lines(words)]
            if page_text and not page_text.search(''.join(lines)):
                continue
            rows = []
            for row in lines:
                if start and start.search(row):
                    inside = True
                    continue
                if end and inside and end.search(row):
                    stopped = True
                    break
                if inside:
                    rows.append(row)
            if (start or end) and not rows:
                if stopped:
                    break
                continue
            page = pdf.pages[number - 1] if pdf else None
            current = Page(number, page, rows)
            found = finder.find(current, options, state)
            for step, step_options in steps:
                found = step.apply(found, current, step_options)
            position = 0
            for candidate in found:
                kept = finish(candidate, marks)
                if kept is None or marks.get('unique') and any(i.title == kept.name for i in items):
                    continue
                position += 1
                items.append(PressItem(number, kept.name, [kept.name, *kept.names], kept.is_new,
                                       amount(kept.amount, marks.get('unit', '千円')), kept.points, position))
            if page is not None:
                page.flush_cache()
            if stopped:
                break
    finally:
        if pdf is not None:
            pdf.close()
    return items
