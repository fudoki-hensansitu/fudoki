"""Characters filled in white over the printed ones (町田市の部別予算概要説明書 R6・R7).

Each line of the 事業別支出科目一覧 carries the 款・項・目 numbers, the 目 name and the 事業 name of its row in white
over the visible text (`1 1 1 議会費01 議員人件費` under `議員報酬 239,040`). They print nothing, but the text layer
holds them where the visible words are, so Poppler joins them into the words. pdfium merges a white character with
a visible one of the same letter drawn at almost the same place (`費`), so the characters are read with pdfplumber,
which keeps each with its fill: on a page that fills any character white, the words are rebuilt from the others.

The list sets its words solid, with no blank inside a name or an amount. A name too long for its column runs on
to a few points short of the next column's text (`…基本計画策定費` `文化振興課`, `選挙管理委員会事務局` `248,441`), so
two characters further apart than `GAP` line heights start another word.
"""
from __future__ import annotations

from pathlib import Path

WHITE = 0.98  # each component of the fill at least this (0-1): paper, not ink
GAP = .3  # line heights between two characters of different words (the run-on names stop 5.6pt short at 11pt)


def white(color) -> bool:
    if color is None:
        return False
    values = list(color) if isinstance(color, (list, tuple)) else [color]
    if len(values) == 4:  # CMYK: no ink
        return max(values) <= 1 - WHITE
    return bool(values) and min(values) >= WHITE


def drop(pdf_path: Path, pages, report) -> None:
    import pdfplumber
    from ingestion.generic.repair import words_from_glyphs
    with pdfplumber.open(pdf_path) as pdf:
        for page in pages:
            chars = [c for c in pdf.pages[page.number - 1].chars if c['text'].strip()]
            hidden = [c for c in chars if white(c.get('non_stroking_color'))]
            if not hidden:
                continue
            report.hidden_glyphs += len(hidden)
            page.words = words_from_glyphs([((c['x0'], c['top'], c['x1'], c['bottom']), c['text'])
                                            for c in chars if not white(c.get('non_stroking_color'))], report, page.rules,
                                            gap=GAP)
