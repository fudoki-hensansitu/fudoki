"""Observation stage for scan PDFs: pinned OCR observations and image rules as generic pages.

The generic builder reads Poppler words and drawn rules. A scan PDF has neither, so this
module turns one pinned OCR observation (ADR 0019) into the same ``Page`` values: rules come
from the page image (``pdf_rules``) and words from the OCR lines. Vision cuts a line into
pieces at wide gaps, including the gap a scanned thousands separator leaves ("15,936" "120"),
so the pieces of one line are cut at the vertical rules first and rejoined within a cell when
they nearly touch, unless one of them is an amount.
"""
from __future__ import annotations

from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
from functools import cache
import re

from ingestion.generic.layout import SIGNS, _frames, _header_bottom, normalize
from ingestion.generic.observe import Page, Rule, Word
from ingestion.lib import pdf_rules
from ingestion.lib.scan_ocr import superseded
from ingestion.lib.ocr_names import (AmountDictionary, AmountRule, correct_amount, correct_name, correct_variant_chars,
                                     load_name_dictionary, load_variant_chars)

# Vision reads the minus sign △ as a letter.
MINUS = re.compile(r'^[AΔ▲−-]\s*(?=[0-9])')
NUMBER = re.compile(r'△?[0-9][0-9,.]*')
AMOUNT = re.compile(r'△?[0-9]{1,3}([,.][0-9]{3})+|△?[0-9]{4,}')
GROUPED = re.compile(r'△?[0-9]{1,3}([,.][0-9]{3})+')
# Pieces closer than this share of the line height belong to one word.
JOIN_GAP = .6
HEADER_NAMES = Path(__file__).with_name('scan_header_corrections.json')


@cache
def header_names():
    return load_name_dictionary(HEADER_NAMES)


def header_path(header: tuple[str, ...]) -> tuple[str, ...]:
    """Correct a complete printed header, after its wrapped OCR words have been joined."""
    corrected = [correct_name(part, header_names())['corrected_name'] for part in header]
    # A heading wrapped so that its last character is a cell of its own (`翌年度繰越` / `額`) is one segment.
    return tuple(part for index, part in enumerate(corrected)
                 if not (part == '額' and index and corrected[index - 1].endswith('額')))


def _layout(observed: list[Page], columns: dict | None, *, spread: dict | None = None,
            header: dict | None = None) -> list:
    from ingestion.generic.layout import logical_pages
    found = logical_pages(observed, columns=columns, spread=spread, header=header)
    for logical in found:
        logical.ocr = True
        for band in logical.bands:
            band.header = header_path(band.header)
        # A column header that spans two columns (`項目` over 項 and 目) is read once, over the second:
        # the first column has no header of its own and takes the one beside it.
        for band, following in reversed(list(zip(logical.bands, logical.bands[1:]))):
            if not band.header and band.kind == 'label' and following.kind == 'label' and following.header:
                band.header = following.header
        for band in logical.bands:
            setting = (columns or {}).get('／'.join(band.header), {})
            band.kind = setting.get('kind', band.kind)
            band.axis_header = setting.get('axis_header', band.axis_header)
    return found


def _text(raw: str) -> str:
    text = MINUS.sub('△', raw.strip().replace('，', ','))
    numeric = re.sub(r'\s+', '', text).replace('、', ',')
    if NUMBER.fullmatch(numeric):
        text = numeric
    if NUMBER.fullmatch(text) and re.search(r'[0-9][,.]?[0-9]', text):
        sign = '△' if text.startswith('△') else ''
        digits = re.sub(r'[^0-9]', '', text)
        # A misplaced or missing separator ("15,936120") is regrouped; a leading zero is kept.
        if not digits.startswith('0') or len(digits) == 1:
            return sign + f'{int(digits):,}'
    return text


def _amount(text: str) -> bool:
    return bool(AMOUNT.fullmatch(_text(text)))


def _split(word: Word, cuts: list[float]) -> list[Word]:
    """Cut a piece that crosses vertical rules, giving each side its share of the characters."""
    inside = [x for x in cuts if word.x0 + 1 < x < word.x1 - 1]
    if not inside or len(word.text) < 2:
        return [word]
    pieces, start, used = [], word.x0, 0
    width = (word.x1 - word.x0) / len(word.text)
    if _amount(word.text) and (GROUPED.fullmatch(re.sub(r'\s+', '', word.text))
                               or all(x - word.x0 < width for x in inside)):
        # An amount is set flush right in its cell: a rule within its first character's width crosses
        # the OCR box's padding, not a digit (`1,981,045,000` over a rule 2pt from its left, 281000). Nor does
        # a rule cut digits grouped by threes: two cells' prints run together never group so
        # as read (`17,585,227,000` boxed 3pt past its cell's right rule, 281000; `0532,413,000` and
        # `130,577,0001,156,707,000` are cut).
        return [word]
    if (NUMBER.fullmatch(_text(word.text)) and len(_text(word.text)) >= 3
            and all(word.x1 - x < width for x in inside)):
        # Nor does a rule within a character of a number's end: the box runs past its cell's right rule
        # (`448` of `134,271 448`, `296` 3pt past it, 281000), and no whole digit fits in that sliver. The box
        # still ends at the rule, as a cut keeping every character gives it (`422` 1pt past it, 132152).
        return [word] if _amount(word.text) else [Word(word.text, word.x0, word.y0, min(inside), word.y1)]
    for x in [*inside, word.x1]:
        end = len(word.text) if x == word.x1 else max(used, min(len(word.text), round((x - word.x0) / width)))
        if end > used:
            pieces.append(Word(word.text[used:end], start, word.y0, x, word.y1))
        start, used = x, end
    if len(pieces) == 1 and pieces[0].text == word.text and _amount(word.text):
        # A rule only clipped OCR padding, not a character. Keep the observed amount's
        # box so its source remains one exact observation (grouped amounts may overhang).
        return [word]
    return pieces


PADDLE_REACH = 1.5  # pt
STACKED_SHARE = .5  # pieces overlapping less than this share of their height are on different lines
DASHES = '一-－ー—―‐−'  # a dash in an amount cell is no amount: the cell prints nothing there
# digits and commas of an amount, with its sign; a code's periods (`10.04.01.03`) are not an amount's
NUMERIC_RUN = re.compile(r'[△▲−-]?[0-9][0-9,]*|,+|[△▲−-]')


def _paddle_pieces(line: dict, children: list[Word], corrected: bool, cuts: list[float] = ()) -> list[Word] | None:
    """Where the printed characters of a Paddle line sit, for cutting it at the rules.

    A Paddle line's children are fragments (`12` `,` `828` `,` `111`), but they carry the x of each
    character. Cutting the line by a share of its box per character count puts the cut in the wrong place
    when digits and kanji run together (`12,828,111同項…` cut after `12,828`, 131181). The children are
    used only when they spell the whole line (no character lost or changed, no declared correction), and a
    run of number fragments is joined back into one amount word, which `_split` then protects like a
    whole amount. A line that is only one number keeps its own box: None, so the caller uses the line.
    """
    if corrected:
        return None
    spelled, printed = ''.join(c.text for c in children), re.sub(r'\s+', '', line['raw_text'])
    if re.sub(r'\s+', '', spelled) != printed and len(re.sub(r'\s+', '', spelled)) == len(printed) \
            and all(c.text == re.sub(r'\s+', '', c.text) for c in children):
        # A declared name correction replaced characters of the line one for one (`センタ一費` → `センター費`): the
        # children keep where each character sits, and take the corrected characters in order.
        position, fixed = 0, []
        for child in children:
            fixed.append(Word(printed[position:position + len(child.text)], child.x0, child.y0, child.x1, child.y1))
            position += len(child.text)
        children = fixed
    if re.sub(r'\s+', '', ''.join(c.text for c in children)) != re.sub(r'\s+', '', line['raw_text']):
        # The children lost characters (`2,490,840円` has no `2` `,`): the line is not cut from them. A printed
        # unit 円 at its end still has its own box, so the amount is cut off before it and stays whole.
        tail = max(children, key=lambda c: c.x0, default=None)
        text = line['raw_text'].rstrip()
        if tail is not None and tail.text == '円' and text.endswith('円') and len(_text(text)) > 1:
            x0, y0, x1, y1 = line['bbox_pdf_pt']
            return [Word(text[:-1], x0, y0, tail.x0, y1), tail]
        return None
    # The children are in the order the line is spelled. A spaced-out name (`3 広 報 費`) gets a box for `広` that
    # starts left of the `3` before it, and sorted by x it would read `広3報費`: a box that starts before the one
    # before it starts where that one ends.
    ordered: list[Word] = []
    for child in children:
        if not child.text.strip():
            continue
        crossing = [x for x in cuts if child.x0 < x < child.x1]
        # (only where cutting by a share of the box would put the rule at another digit than the grouping says)
        share = lambda x: round((x - child.x0) / ((child.x1 - child.x0) / max(1, len(child.text))))
        if (ordered and ordered[-1].text == ',' and re.fullmatch(r'[0-9]{4,}', child.text)
                and crossing and any(share(x) != 3 for x in crossing)):
            # The group after a comma has three digits: a longer run that a rule crosses is the end of one amount
            # and the first digits of the next cell's (`0005` = `000` + `5` of `…,051,000` | `5,918,437,000`, 281000).
            width = (child.x1 - child.x0) / len(child.text)
            edge = child.x0 + 3 * width
            ordered.append(Word(child.text[:3], child.x0, child.y0, edge, child.y1))
            child = Word(child.text[3:], edge, child.y0, child.x1, child.y1)
        elif (re.fullmatch(r'0[0-9]+', child.text) and crossing
              and not (ordered and ordered[-1].text == ',')):
            # No amount starts with a 0 and more digits: the 0 is a cell of its own, the rule's other side starts
            # the amount (`017,585,227,000` = `0` | `17,585,227,000`, 281000).
            edge = child.x0 + (child.x1 - child.x0) / len(child.text)
            ordered.append(Word('0', child.x0, child.y0, edge, child.y1))
            child = Word(child.text[1:], edge, child.y0, child.x1, child.y1)
        if ordered and child.x0 < ordered[-1].x0:
            child = Word(child.text, min(ordered[-1].x1, child.x1), child.y0, child.x1, child.y1)
        ordered.append(child)
    merged: list[Word] = []
    for child in ordered:
        last = merged[-1] if merged else None
        if (last is not None and NUMERIC_RUN.fullmatch(_text(child.text)) and NUMERIC_RUN.fullmatch(_text(last.text))
                # a rule between the end of the fragment before and the start of this one keeps two cells apart; one that
                # only crosses the first character's box (`1,981,045,000` over a rule 2pt from its left) does not
                and not any(last.x1 - min(2, (last.x1 - last.x0) / 2) < x <= child.x0 + PADDLE_REACH for x in cuts)
                # (a comma, or a minus sign set apart from its digits `△ 15,673,555`, sits farther from its neighbour)
                and child.x0 - last.x1 <= (2 * JOIN_GAP if last.text.endswith(',') or child.text.startswith(',')
                                           or re.fullmatch(r'[△▲−-]', _text(last.text)) else JOIN_GAP)
                * max(last.y1 - last.y0, child.y1 - child.y0)):
            merged[-1] = Word(last.text + child.text, last.x0, min(last.y0, child.y0), max(last.x1, child.x1),
                              max(last.y1, child.y1))
        else:
            merged.append(child)
    # A code (`10.04.01.03へ流用`) reads as an amount of its own when it stands alone: it stays in front of its text.
    joined: list[Word] = []
    for word in merged:
        if joined and re.search(r'[0-9]\.[0-9]', joined[-1].text) and not NUMERIC_RUN.fullmatch(_text(word.text)):
            last = joined[-1]
            joined[-1] = Word(last.text + word.text, last.x0, min(last.y0, word.y0), max(last.x1, word.x1), max(last.y1, word.y1))
        else:
            joined.append(word)
    merged = joined
    if len(merged) < 2:
        return None
    # The line's own box includes the padding its characters' boxes lack: the ends keep it, so a line no rule cuts
    # is the same word with the same box as when it is not cut from its children.
    x0, _, x1, _ = line['bbox_pdf_pt']
    # (padding that reaches over a rule is not kept: the character is on the other side of it. A rule within a point
    # of the line's edge is padding, as `_split` takes it.)
    first, last = merged[0], merged[-1]
    if not any(x0 + 1 < x <= first.x0 + PADDLE_REACH for x in cuts):
        merged[0] = Word(first.text, min(x0, first.x0), first.y0, first.x1, first.y1)
    if not any(last.x1 - PADDLE_REACH <= x < x1 - 1 for x in cuts):
        merged[-1] = Word(last.text, last.x0, last.y0, max(x1, last.x1), last.y1)
    return merged


def _cell_words(pieces: list[Word], cuts: list[float], reach: float = 0) -> list[Word]:
    """Rejoin the pieces of one OCR line that sit in the same cell and nearly touch.

    ``reach``: how far past a piece's left edge a rule still lies in front of it. A Paddle character box
    can start a little left of the rule its character sits right of (`同` 0.6pt, 131181)."""
    words: list[Word] = []
    for piece in sorted((p for w in pieces for p in _split(w, cuts)), key=lambda w: w.x0):
        if words:
            last = words[-1]
            height = max(last.y1 - last.y0, piece.y1 - piece.y0)
            # Digits a rule's padding separates: the first piece's box overhangs the rule by under 2pt, so it starts
            # in the cell the layout places it in (`551` `111,000`, 281000).
            digits = bool(NUMBER.fullmatch(_text(last.text)) and NUMBER.fullmatch(_text(piece.text)))
            pad = min(2, (last.x1 - last.x0) / 2) if digits else 0
            same_cell = not any(last.x0 + pad + reach < x <= piece.x0 + reach for x in cuts)
            # "2" "款" "1" "項" join; a name and its amount stay apart even when they nearly touch.
            amount_with_text = _amount(last.text) != _amount(piece.text) and not (
                NUMBER.fullmatch(_text(last.text)) and NUMBER.fullmatch(_text(piece.text)))
            # Characters of two printed lines stacked in one box (Paddle reads `使` over `賃` of a name set on
            # two lines, 281000) are two words: the one line's words overlap in height.
            stacked = min(last.y1, piece.y1) - max(last.y0, piece.y0) < STACKED_SHARE * min(last.y1 - last.y0, piece.y1 - piece.y0)
            if same_cell and piece.x0 - last.x1 <= JOIN_GAP * height and not amount_with_text and not stacked:
                words[-1] = Word(last.text + piece.text, last.x0, min(last.y0, piece.y0), piece.x1,
                                 max(last.y1, piece.y1))
                continue
        words.append(piece)
    return [Word(_text(w.text), w.x0, w.y0, w.x1, w.y1) for w in words if w.text.strip()]


def short_rows(pdf: Path, detected: pdf_rules.PageRules, dark: int = pdf_rules.DARK,
               staircase: bool = False) -> pdf_rules.PageRules:
    """A continuous horizontal stroke joining two observed vertical rules closes their cell.

    The page-wide detector deliberately omits short strokes. Here both ends must meet
    table rules; isolated ink and text do not establish a row boundary.
    """
    from dataclasses import replace
    import numpy as np
    if len(detected.vertical) < 2:
        return detected
    image = pdf_rules.render(pdf, detected.page)
    scale = pdf_rules.DPI / 72
    vertical = sorted(detected.vertical, key=lambda r: r.position)
    runs = []
    for left, right in zip(vertical, vertical[1:]):
        top, bottom = max(left.start, right.start), min(left.end, right.end)
        x0, x1 = round(left.position * scale), round(right.position * scale)
        if top >= bottom or x1 <= x0:
            continue
        y0, y1 = max(0, round(top * scale)), min(image.shape[0], round(bottom * scale))
        joined = np.all(image[y0:y1, x0:x1 + 1] < dark, axis=1)
        runs.extend((y0 + int(y), x0, x1 + 1) for y in np.flatnonzero(joined))
    found = pdf_rules._merge(runs, 1 / scale)
    extra = [r for r in found if not any(abs(old.position - r.position) <= 1
             and old.start <= r.start + 1 and r.end <= old.end + 1 for old in detected.horizontal)]
    horizontal = sorted([*detected.horizontal, *extra], key=lambda r: (r.position, r.start))
    # Likewise, in a staircase (the layout setting `header.staircase`), a short vertical stroke joining two
    # horizontal rules at the place of a vertical rule the page draws elsewhere closes a cell: the deepest
    # level column on a page's last row (281000).
    columns = []
    for x in sorted({round(r.position, 1) for r in vertical}) if staircase else ():
        across = [r for r in horizontal if r.start - 1 <= x <= r.end + 1]
        for upper, lower in zip(across, across[1:]):
            top, bottom = upper.position, lower.position
            if bottom - top < 2:
                continue
            if any(abs(r.position - x) <= 1 and r.start <= top + 1 and bottom - 1 <= r.end for r in vertical):
                continue
            px, y0, y1 = round(x * scale), round(top * scale) + 1, round(bottom * scale)
            if y1 > y0 and np.any(np.all(image[y0:y1, max(0, px - 1):px + 2] < dark, axis=0)):
                columns.append(pdf_rules.Rule(x, top, bottom, vertical[0].thickness))
    return replace(detected, horizontal=tuple(horizontal),
                   vertical=tuple(sorted([*detected.vertical, *columns], key=lambda r: (r.position, r.start))))


LEADING_MARK = re.compile(r'[◎○〇●•・]')


def with_mark(item: dict, pieces: list[Word] | None) -> list[Word] | None:
    """The bullet that starts an OCR line (`◎地域福祉センター管理運営費`, `•電気料金`) that its word ranges leave out:
    a printed text layer keeps the mark in the first word, and the levels of a 備考 are read from where it starts."""
    mark = LEADING_MARK.match(item['raw_text'].strip())
    if not pieces or not mark:
        return pieces
    first = min(pieces, key=lambda w: w.x0)
    left = item['bbox_pdf_pt'][0]
    if LEADING_MARK.match(first.text) or first.x0 - left < 1:
        return pieces
    text = '・' if mark.group() == '•' else mark.group()
    return [Word(text + first.text, left, first.y0, first.x1, first.y1), *[p for p in pieces if p is not first]]


def page(observation_page: dict, pdf: Path, corrections: AmountDictionary | None = None,
         used: set[str] | None = None, detected: pdf_rules.PageRules | None = None, keep_marks: bool = False) -> Page:
    number = observation_page['page_number']
    detected = detected or pdf_rules.detect(pdf, number)
    rules = [Rule(r.position, r.start, r.position, r.end) for r in detected.vertical]
    rules += [Rule(r.start, r.position, r.end, r.position) for r in detected.horizontal]
    cuts = sorted(r.position for r in detected.vertical)
    gone = superseded(observation_page)
    # Adjacent OCR tiles can both read a comma's descender. Keep its complete number;
    # a punctuation fragment contained in that number's box is no second amount.
    readings = [(index, o) for index, region in enumerate(observation_page['regions']) for o in region['observations']
                if o['kind'] == 'region' and o['id'] not in gone and o.get('bbox_pdf_pt')]
    complete = [(region, o) for region, o in readings if _amount(o['raw_text'])
                and not any(o['bbox_pdf_pt'][0] + 1 < x < o['bbox_pdf_pt'][2] - 1 for x in cuts)]
    declared = {r.observation_id for r in corrections.rules if r.page == number} if corrections else set()
    fragments = {o['id'] for region, o in readings if _text(o['raw_text']) in (',', '、') and o['id'] not in declared
                 and any(region != other and ',' in _text(full['raw_text'])
                         and full['bbox_pdf_pt'][0] - 1 <= o['bbox_pdf_pt'][0]
                         and full['bbox_pdf_pt'][1] - 1 <= o['bbox_pdf_pt'][1]
                         and o['bbox_pdf_pt'][2] <= full['bbox_pdf_pt'][2] + 1
                         and o['bbox_pdf_pt'][3] <= full['bbox_pdf_pt'][3] + 1 for other, full in complete)}
    # A digitless single character inside another tile's single-character reading of the same ink (a zero
    # cut by a tile seam, read as `く` above and `っ` below) is one printed mark, not a second amount cell.
    marks = [(region, o) for region, o in readings if len(o['raw_text'].strip()) == 1
             and not any(c.isdigit() for c in o['raw_text']) and o['raw_text'] != '円']
    fragments |= {o['id'] for region, o in marks if o['id'] not in declared
                  and any(region != other and full['id'] != o['id']
                          and full['bbox_pdf_pt'][0] - 1 <= o['bbox_pdf_pt'][0] and full['bbox_pdf_pt'][1] - 1 <= o['bbox_pdf_pt'][1]
                          and o['bbox_pdf_pt'][2] <= full['bbox_pdf_pt'][2] + 1 and o['bbox_pdf_pt'][3] <= full['bbox_pdf_pt'][3] + 1
                          and (full['bbox_pdf_pt'][2] - full['bbox_pdf_pt'][0]) * (full['bbox_pdf_pt'][3] - full['bbox_pdf_pt'][1])
                          > (o['bbox_pdf_pt'][2] - o['bbox_pdf_pt'][0]) * (o['bbox_pdf_pt'][3] - o['bbox_pdf_pt'][1])
                          for other, full in marks)}
    gone |= fragments
    words: list[Word] = []
    for region in observation_page['regions']:
        items = [o for o in region['observations'] if o['id'] not in gone
                 and o.get('parent_id') not in fragments and o['bbox_pdf_pt'] and o['raw_text'].strip()]
        corrected_regions = set()
        corrected_word_parents = set()
        if corrections:
            fixed = []
            declared = {r.observation_id for r in corrections.rules if r.page == number}
            for item in items:
                if item['id'] in declared:
                    result = correct_amount(item['raw_text'], page=number, observation_id=item['id'], dictionary=corrections)
                    item = {**item, 'raw_text': result['corrected_amount']}
                    if used is not None:
                        used.add(result['rule_id'])
                    if item['kind'] == 'region':
                        corrected_regions.add(item['id'])
                    elif item.get('parent_id'):
                        corrected_word_parents.add(item['parent_id'])
                fixed.append(item)
            items = fixed
        parts: dict[str, list[Word]] = {}
        for item in items:
            if item['kind'] == 'word' and item.get('parent_id'):
                parts.setdefault(item['parent_id'], []).append(Word(item['raw_text'], *item['bbox_pdf_pt']))
        for item in items:
            if item['kind'] == 'region':
                # Paddle's word children are single characters and number fragments ('4' ',' '505'); only
                # Vision's words are whole tokens. A Paddle line is split at the rules from its own text.
                pieces = None if item['id'] in corrected_regions else parts.get(item['id'])
                whole = _text(item['raw_text'])
                reach = 0
                if item.get('attempt_id') and pieces is not None:
                    pieces = _paddle_pieces(item, pieces, item['id'] in corrected_word_parents, cuts)
                    reach = PADDLE_REACH if pieces else 0
                if (pieces and item['id'] not in corrected_word_parents and NUMBER.fullmatch(whole)
                        and whole != _text(''.join(p.text for p in pieces))
                        and not any(item['bbox_pdf_pt'][0] + 1 < x < item['bbox_pdf_pt'][2] - 1 for x in cuts)):
                    # Vision's word ranges may omit a minus whose line reading is intact.
                    # One complete number wholly inside a ruled cell outranks incomplete pieces.
                    pieces = None
                if keep_marks:
                    pieces = with_mark(item, pieces)
                words += _cell_words(pieces or [Word(item['raw_text'], *item['bbox_pdf_pt'])], cuts, reach)
    return Page(number, detected.width, detected.height, drop_covered_digits(words), rules)


def drop_covered_digits(words: list[Word]) -> list[Word]:
    """A last digit read a second time: the left end of the line the next tile read (`9予算額…` after `11,547,449`)
    cut at the column rule leaves a digit lying inside the box of the complete amount it ends. One or two digits
    that are the end (or the start) of an amount whose box holds them are that amount's own print, not a word."""
    amounts = [w for w in words if AMOUNT.fullmatch(_text(w.text))]
    def covered(word: Word) -> bool:
        text = _text(word.text)
        if not re.fullmatch(r'[0-9]{1,2}', text):
            return False
        return any(other is not word and len(_text(other.text)) > len(text)
                   and (_text(other.text).endswith(text) or _text(other.text).startswith(text))
                   and other.x0 - 1 <= word.x0 and word.x1 <= other.x1 + 1
                   and min(word.y1, other.y1) - max(word.y0, other.y0) >= .6 * (word.y1 - word.y0)
                   for other in amounts)
    return [w for w in words if not covered(w)]


def _header(page: Page, every: bool = False) -> list[tuple[list[float], float, float, list[Word]]]:
    """Each frame's band edges, its top and header bottom, and the header words: the widest frame,
    or every frame left to right (`header.agree_all_frames`)."""
    frames = _frames(page)
    if not frames:
        return []
    chosen = sorted(frames, key=lambda f: f[0]) if every else [max(frames, key=lambda f: f[1] - f[0])]
    result = []
    for frame in chosen:
        x0, x1, top, _, edges = frame
        bottom = _header_bottom(page, frame)
        words = [w for w in page.words if x0 < (w.x0 + w.x1) / 2 < x1 and top < (w.y0 + w.y1) / 2 < bottom]
        result.append((edges, top, bottom, words))
    return result


def agreed_headers(pages: list[Page], every: bool = False) -> list[Page]:
    """Give pages printed on one frame the header most of them read, column by column.

    Every page of a scanned statement repeats the same header, but OCR reads it differently
    from page to page (a missed 目, 繰越 as 灤越). The builder learns a band's kind per header
    path over the document, so a misread splits one column into several. Pages whose frames
    have the same band widths share one reading: for each band, the text most pages read
    (ties to the longer), with the words of a page that read it, moved onto each page.
    The widest frame is agreed; `every` (`header.agree_all_frames`) agrees each frame of a
    spread, matched by its place from the left.
    """
    replaced = {i: list(p.words) for i, p in enumerate(pages)}
    framed = [_header(p, every) for p in pages]
    for place in range(max((len(f) for f in framed), default=0)):
        headers = [f[place] if place < len(f) else None for f in framed]
        groups: dict[tuple, list[int]] = {}
        for index, header in enumerate(headers):
            if header:
                widths = (len(framed[index]), tuple(round((b - a) / 3) for a, b in zip(header[0], header[0][1:])))
                groups.setdefault(widths, []).append(index)
        for members in groups.values():
            if len(members) < 2:
                continue
            columns = len(headers[members[0]][0]) - 1
            chosen: list[tuple[int, int]] = []  # (band, page index whose reading wins)
            for band in range(columns):
                readings = {}
                for index in members:
                    edges, _, _, words = headers[index]
                    inside = sorted((w for w in words if edges[band] < (w.x0 + w.x1) / 2 < edges[band + 1]),
                                    key=lambda w: (round(w.y0 / 4), w.x0))
                    readings[index] = normalize(''.join(w.text for w in inside))
                counts = Counter(readings.values())
                best = max(counts, key=lambda text: (counts[text], len(text)))
                chosen.append((band, next(i for i in members if readings[i] == best)))
            for index in members:
                edges, top, _, words = headers[index]
                header_ids = {id(w) for w in words}
                moved = []
                for band, source in chosen:
                    source_edges, source_top, _, source_words = headers[source]
                    dx, dy = edges[band] - source_edges[band], top - source_top
                    moved += [Word(w.text, w.x0 + dx, w.y0 + dy, w.x1 + dx, w.y1 + dy) for w in source_words
                              if source_edges[band] < (w.x0 + w.x1) / 2 < source_edges[band + 1]]
                replaced[index] = [w for w in replaced[index] if id(w) not in header_ids] + moved
    return [Page(p.number, p.width, p.height, replaced[i], p.rules) for i, p in enumerate(pages)]


def read_headers(observed: list[Page], readings: list[dict] | None) -> list[Page]:
    """Header cells OCR misread or left unread, as the conversion's options declare them from the rendered
    page (`header_readings`: pages, the cell's box in PDF points, the printed text). The words centred in
    the box give way to the declared text. A page outside the scope, or a box holding a read amount, stops
    the conversion: the declaration is for a header, never for the body."""
    words = {p.number: list(p.words) for p in observed}
    for reading in readings or ():
        x0, y0, x1, y1 = reading['box']
        for number in reading['pages']:
            if number not in words:
                raise ValueError(f'A header reading needs a scoped page: {reading["id"]}')
            inside = [w for w in words[number] if x0 <= (w.x0 + w.x1) / 2 <= x1 and y0 <= (w.y0 + w.y1) / 2 <= y1]
            if any(GROUPED.search(w.text.replace(' ', '')) for w in inside):
                raise ValueError(f'A header reading covers a read amount: {reading["id"]}')
            words[number] = [w for w in words[number] if not any(w is i for i in inside)] + [Word(reading['text'], x0, y0, x1, y1)]
    return [Page(p.number, p.width, p.height, words[p.number], p.rules) for p in observed]


@cache
def variant_chars() -> dict[str, str]:
    return load_variant_chars()


def apply_variant_chars(observation: dict) -> tuple[dict, list[str]]:
    """A copy of a Paddle observation with the characters of the shared table replaced one by one, and one
    line of the receipt for each pair: `徵→徴 3 件（observation ids）`. Pages read by Vision are left as they are."""
    result = json.loads(json.dumps(observation))
    hits: dict[tuple[str, str], list[str]] = {}
    for page in result['pages']:
        if page.get('engine') != 'paddle':
            continue
        for region in page['regions']:
            for o in region['observations']:
                text, found = correct_variant_chars(o['raw_text'], variant_chars())
                if found:
                    o['raw_text'] = text
                    for pair in found:
                        hits.setdefault(pair, []).append(o['id'])
    return result, [f'{a}→{b} {len(ids)} 件（{"・".join(ids)}）' for (a, b), ids in sorted(hits.items())]


def _subsequence(short: str, long: str) -> bool:
    characters = iter(long)
    return all(c in characters for c in short)


def apply_name_corrections(observation: dict, rules: list[dict] | None) -> dict:
    """A copy of the observation with the OCR misread characters of a name replaced, as declared.

    A rule binds to one observation (a line or word) by page and ID and names the exact characters
    the OCR read and the ones the page prints. The raw observation is not changed and the rule must
    match it. Characters are replaced one for one, or characters the OCR lost are put back (the observed
    text is the corrected one without them, in order). The digits of the two texts are the same, in the
    same order: a digit is a code or an amount and is never corrected here."""
    if not rules:
        return observation
    found = {(p['page_number'], o['id']) for p in observation['pages'] for r in p['regions'] for o in r['observations']}
    result = json.loads(json.dumps(observation))
    for rule in rules:
        if (rule['page'], rule['observation_id']) not in found:
            raise ValueError(f'A name correction matches no observation: {rule["id"]}')
        observed, corrected = rule['observed_name'], rule['corrected_name']
        digits = lambda t: [c for c in t if c.isdigit()]
        # Characters are replaced one for one, or a character the OCR lost is put back (`3款民生費` → `第3款民生費`:
        # the observed text is the corrected one without the lost characters). A digit is never changed.
        inserted = len(observed) < len(corrected) and _subsequence(observed, corrected)
        if digits(observed) != digits(corrected) or (len(observed) != len(corrected) and not inserted):
            raise ValueError(f'A name correction replaces characters of a name: {rule["id"]}')
        hit = 0
        for p in result['pages']:
            for r in p['regions']:
                for o in r['observations']:
                    if p['page_number'] != rule['page'] or rule['observed_name'] not in o['raw_text'] \
                            or rule['observation_id'] not in (o['id'], o.get('parent_id')):
                        continue
                    o['raw_text'] = o['raw_text'].replace(rule['observed_name'], rule['corrected_name'])
                    hit += 1
        if not hit:
            raise ValueError(f'The declared misread is not in the observation: {rule["id"]}')
    return result


def pages(observation: dict, pdf: Path, corrections: AmountDictionary | None = None,
          columns: dict | None = None, rules: dict | None = None, *, spread: dict | None = None,
          header: dict | None = None, code_corrections: list[dict] | None = None,
          header_readings: list[dict] | None = None, rule_dark: int = pdf_rules.DARK, rule_hook=None,
          keep_marks: bool = False) -> list[Page]:
    """`rule_hook(PageRules) -> PageRules` completes the rules read from a rendered page before the words are cut at
    them; `keep_marks` keeps the bullet that starts a line in its first word (both for a text document's OCR pages, `mixed.py`)."""
    every = bool((header or {}).get('agree_all_frames'))

    def agreed(found):
        return agreed_headers(read_headers(found, header_readings), every)

    @cache
    def detected(number):
        found = short_rows(pdf, (rules or {}).get(number) or pdf_rules.detect(pdf, number, dark=rule_dark), rule_dark,
                           bool((header or {}).get('staircase')))
        return rule_hook(found) if rule_hook else found

    code_rules, shrunk = [], []
    if code_corrections:
        from ingestion.generic.tree import groups
        plain = agreed([page(p, pdf, detected=detected(p['page_number'])) for p in observation['pages']])
        # The code of a 款・項・目 or of a 節 sits in a label column; a number in an amount column is not a code.
        subjects = [b for l in _layout(plain, columns, spread=spread, header=header)
                    for g in groups(l) for b in g.bands if g.subject or b.kind == 'label']
        readings = {(p['page_number'], o['id']): o for p in observation['pages']
                    for region in p['regions'] for o in region['observations']}
        for rule in code_corrections:
            item = readings.get((rule['page'], rule['observation_id']))
            if item is None or item['raw_text'] != rule['observed_code']:
                raise ValueError(f'Declared observed code differs from the observation: {rule["id"]}')
            if item['kind'] != 'word' or not all(re.fullmatch(r'[0-9０-９]+', rule[key])
                    for key in ('observed_code', 'corrected_code')):
                raise ValueError(f'A code correction requires a numeric word: {rule["id"]}')
            box = item['bbox_pdf_pt']
            bands = [b for b in subjects if b.page == rule['page']]
            cuts = sorted({x - b.offset for b in bands for x in (b.x0, b.x1)})
            pieces = _split(Word(item['raw_text'], *box), cuts) if box else []
            if not pieces or not all(any(b.x0 - b.offset <= (w.x0 + w.x1) / 2 <= b.x1 - b.offset
                    and b.body_top <= (w.y0 + w.y1) / 2 <= b.body_bottom for b in bands) for w in pieces):
                raise ValueError(f'A code correction needs a subject or breakdown label column: {rule["id"]}')
            code_rules.append(AmountRule(rule['id'], rule['page'], rule['observation_id'],
                                         rule['observed_code'], rule['corrected_code'], rule['reason']))
            if len(rule['corrected_code']) < len(rule['observed_code']):
                shrunk.append(rule)  # the extra characters were a ruling or a stroke, not part of the number
    if corrections:
        from ingestion.generic.layout import page_bands
        plain = agreed([page(p, pdf, detected=detected(p['page_number'])) for p in observation['pages']])
        units = unit_glyphs(plain, columns, spread=spread, header=header)
        bands = {p.number: page_bands(p, spread, header)[0] for p in plain}
        boxes = {(p['page_number'], o['id']): o['bbox_pdf_pt'] for p in observation['pages']
                 for region in p['regions'] for o in region['observations']}
        for rule in corrections.rules:
            if normalize(rule.observed_amount) == '円':
                raise ValueError(f'A unit is not an amount correction: {rule.id}')
            box = boxes.get((rule.page, rule.observation_id))
            if box and any(p == rule.page and all(abs(a - b) < 1 for a, b in zip(box, bounds)) for p, bounds in units):
                raise ValueError(f'A unit glyph is not an amount correction: {rule.id}')
            if not any(c.isdigit() for c in rule.observed_amount) and (not box or not any(
                                  (columns or {}).get('／'.join(header_path(b.header)), {}).get('kind') == 'amount'
                                  and b.x0 <= (box[0] + box[2]) / 2 <= b.x1
                                  and b.body_top <= (box[1] + box[3]) / 2 <= b.body_bottom
                                  for b in bands.get(rule.page, []))):
                raise ValueError(f'Digitless correction needs a declared amount column: {rule.id}')
    if shrunk:
        # A code the OCR read with a stroke attached is as wide as the printed digits: shrink its box (the
        # raw text is unchanged) so the number is placed by the digits it prints.
        observation = json.loads(json.dumps(observation))
        for rule in shrunk:
            for p in observation['pages']:
                for region in p['regions']:
                    for o in region['observations']:
                        if p['page_number'] == rule['page'] and o.get('bbox_pdf_pt') and o['raw_text'] == rule['observed_code'] \
                                and rule['observation_id'] in (o['id'], o.get('parent_id')):
                            x0, y0, x1, y1 = o['bbox_pdf_pt']
                            o['bbox_pdf_pt'] = [x0, y0, x0 + (x1 - x0) * len(rule['corrected_code']) / len(rule['observed_code']), y1]
    if code_rules:
        corrections = amount_dictionary([r.__dict__ for r in [*(corrections.rules if corrections else ()), *code_rules]])
    used = set()
    found = [page(p, pdf, corrections, used, detected(p['page_number']), keep_marks) for p in observation['pages']]
    unused = {r.id for r in corrections.rules} - used if corrections else set()
    if unused:
        raise ValueError(f'Amount corrections matched no observation: {sorted(unused)}')
    found = agreed(found)
    units = unit_glyphs(found, columns, spread=spread, header=header)
    return [Page(p.number, p.width, p.height,
                 [Word('円', w.x0, w.y0, w.x1, w.y1) if w.text == '门' and (p.number, (w.x0, w.y0, w.x1, w.y1)) in units else w
                  for w in p.words], p.rules) for p in found]


def unit_glyphs(observed: list[Page], columns: dict | None = None, *, spread: dict | None = None,
                header: dict | None = None) -> set[tuple]:
    """A row of small currency marks above the first named subject row is a unit row.

    At least three read 円 marks on the same baseline next to the header establish it. OCR glyphs
    on that row (门 for 円) cannot be values; inline units beside actual money are below
    the first subject row and do not qualify. The amount rereader uses this same boundary.
    """
    return logical_units(_layout(observed, columns, spread=spread, header=header))


def logical_units(logicals_: list) -> set[tuple]:
    from ingestion.generic.tree import subject_header
    found = set()
    for logical in logicals_:
        names = [g.y0 for b in logical.bands if b.header and subject_header(b.header)
                 for g in b.words if re.search(r'[\u3040-\u30ff\u3400-\u9fff]', g.text)]
        if not names:
            continue
        first = min(names)
        glyphs = [g for b in logical.bands for g in b.words]
        for page_number in logical.pages:
            yen = [g for b in logical.bands for g in b.words if g.page == page_number and g.text == '円'
                   and (g.y0 + g.y1) / 2 < first and (g.y0 + g.y1) / 2 <= b.body_top + g.y1 - g.y0]
            for glyph in [g for g in glyphs if g.page == page_number and len(g.text) == 1]:
                cy = (glyph.y0 + glyph.y1) / 2
                if cy < first and sum(abs(cy - (g.y0 + g.y1) / 2) <= 2 for g in yen) >= 3:
                    found.add((page_number, glyph.original))
    return found


def logicals(observation: dict, pdf: Path, corrections: AmountDictionary | None = None,
             columns: dict | None = None, *, recover: bool = False, recovered: list | None = None,
             spread: dict | None = None, header: dict | None = None, code_corrections: list[dict] | None = None,
             rule_dark: int = pdf_rules.DARK) -> list:
    """The logical pages of an OCR observation, marked as OCR so the builder's rules for misreads apply."""
    observed = pages(observation, pdf, corrections, columns, spread=spread, header=header,
                     code_corrections=code_corrections, rule_dark=rule_dark)
    if recover:
        observed, fills = recover_codes(observed, pdf, columns, spread=spread, header=header)
        if recovered is not None:
            recovered.extend(fills)
    return _layout(observed, columns, spread=spread, header=header)


def code_holes(logical_pages_: list) -> list[dict]:
    """Only a numbered subject sequence with one missing row warrants an ink search.

    A 6 / unnumbered name / 8, or an unnumbered name followed by 2 at the start of a
    sequence, locates the missing code. Wrapped names in the same ruled cell do not.
    This does not supply the missing number: recovery must also read ink at its position.
    """
    from ingestion.generic.layout import lines, text
    from ingestion.generic.tree import _cell, _split_code, groups, subject_items
    holes = []
    for logical in logical_pages_:
        for group in groups(logical):
            if not group.subject:
                continue
            items = subject_items(group)
            for level, band in enumerate(group.bands):
                members = [i for i in items if i.level == level and i.lines]
                for index, item in enumerate(members[:-1]):
                    following = members[index + 1]
                    if (item.code or len(item.name) < 2 or not re.match(r'[\u3040-\u30ff\u3400-\u9fff]', item.name)
                            or not following.code or not following.code.isdigit()):
                        continue
                    if _cell(band, item.anchor) == _cell(band, following.anchor):
                        continue
                    previous = members[index - 1] if index else None
                    next_code = int(following.code)
                    if previous and previous.code and previous.code.isdigit() and next_code == int(previous.code) + 2:
                        expected = next_code - 1
                    elif next_code == 2 and (previous is None or (previous.code and previous.code != '1')):
                        expected = 1
                    else:
                        continue
                    glyph = following.lines[0][0]
                    x = glyph.x0 - glyph.offset
                    height = item.y1 - item.y0
                    holes.append({'page': item.page, 'expected': expected, 'name': item.name,
                                  'box': (x - 2, item.y0 - 1, x + height, item.y1 + 1), 'height': height})
                # A narrow code column can have no observation at all in the first cell.
                # Its name lives in a neighbouring subject column; the next printed 2 and
                # the preceding ruled cell locate that single hole before any ink is read.
                events = [(line, _split_code(normalize(text(line)))[0]) for line in lines(band.words)]
                known = [(line, int(code)) for line, code in events if code and code.isdigit()]
                for position, (line, code) in enumerate(known):
                    if code != 2 or position and known[position - 1][1] == 1:
                        continue
                    span = _cell(band, (line[0].y0 + line[0].y1) / 2)
                    boundaries = sorted({band.body_top, *band.rows, band.body_bottom})
                    prior = [y for y in boundaries if y < span[0] - .5]
                    if not prior:
                        continue
                    upper, lower = prior[-1], span[0]
                    if any(upper <= (g.y0 + g.y1) / 2 < lower and re.search(r'[0-9]', g.text) for g in band.words):
                        continue
                    names = [g for other in group.bands[level:] for g in other.words
                             if upper <= (g.y0 + g.y1) / 2 < lower and re.search(r'[\u3040-\u30ff\u3400-\u9fff]', g.text)]
                    if not names:
                        continue
                    hint = min(names, key=lambda g: (g.y0, g.x0))
                    height, x = hint.y1 - hint.y0, line[0].x0 - line[0].offset
                    holes.append({'page': hint.page, 'expected': 1, 'name': hint.text,
                                  'box': (x - 2, hint.y0 - 1, x + height, hint.y1 + 1), 'height': height})
    return list({(h['page'], tuple(round(v, 1) for v in h['box'])): h for h in holes}.values())


def drop_readings(observation: dict, rules: list[dict] | None) -> dict:
    """OCR readings that read again the marks another reading already covers (two overlapping ink re-reads,
    `13億用料及` over `13使用料及`), as the conversion's options declare them from the rendered page
    (`dropped_readings`: page, observation id and the text read). The reading and its words are left out; one
    not found as declared stops the conversion."""
    if not rules:
        return observation
    drop = {(r['page'], r['observation_id']): r for r in rules}
    found = set()
    pages_ = []
    for p in observation['pages']:
        regions = []
        for region in p['regions']:
            kept = []
            for o in region['observations']:
                rule = drop.get((p['page_number'], o['id']))
                if rule is not None:
                    if o['raw_text'] != rule['observed']:
                        raise ValueError(f'A dropped reading differs from the observation: {rule["id"]}')
                    found.add((p['page_number'], o['id']))
                    continue
                if (p['page_number'], o.get('parent_id')) in drop:
                    continue
                kept.append(o)
            regions.append({**region, 'observations': kept})
        pages_.append({**p, 'regions': regions})
    if missing := sorted(r['id'] for key, r in drop.items() if key not in found):
        raise ValueError(f'Dropped readings matched no observation: {missing}')
    return {**observation, 'pages': pages_}


def add_code_readings(observed: list[Page], readings: list[dict] | None, key: str = 'code',
                      printed: str = r'[0-9]+') -> list[Page]:
    """Subject codes (`code_readings`) or amounts (`amount_readings`, key `amount`) OCR left unread, as the
    conversion's options declare them from the rendered page (page, box in PDF points, the printed text).
    A box that already holds a digit is not a missing reading, and the conversion stops. A code reading may
    carry the subject's name OCR left unread on that line (`name`, `name_box`); its box must hold no reading."""
    words = {p.number: list(p.words) for p in observed}
    for reading in readings or ():
        x0, y0, x1, y1 = reading['box']
        if reading['page'] not in words or not re.fullmatch(printed, reading[key]):
            raise ValueError(f'A {key} reading needs a scoped page and a number: {reading["id"]}')
        if any(re.search(r'[0-9]', w.text) and w.x0 < x1 and x0 < w.x1 and w.y0 < y1 and y0 < w.y1
               for w in words[reading['page']]):
            raise ValueError(f'A {key} reading overlaps a read digit: {reading["id"]} {reading["box"]}')
        words[reading['page']].append(Word(reading[key], x0, y0, x1, y1))
        if reading.get('name'):
            n0, m0, n1, m1 = reading['name_box']
            if any(w.x0 < n1 and n0 < w.x1 and w.y0 < m1 and m0 < w.y1 for w in words[reading['page']]):
                raise ValueError(f'A name reading overlaps a reading: {reading["id"]}')
            words[reading['page']].append(Word(reading['name'], n0, m0, n1, m1))
    return [Page(p.number, p.width, p.height, words[p.number], p.rules) for p in observed]


SECTION_TITLES = {'収入': 'revenue', '支出': 'expenditure'}
SECTION_TITLE_REACH = 60.0  # pt: how far under its title the table's top rule may lie


def direction_sections(printed: list[Page], direction: str | None) -> tuple[list[Page], list[int], set[int]]:
    """The part of each page printed under the section title of the manifest's direction.

    An enterprise statement (公営企業会計) prints its 収入 and 支出 tables one above the other on one page, each
    under a title at the left margin (`収入` / `支出`). A page without a title goes on with the section of the
    page before it. The words and rules outside the direction's sections are left out, so a table of the other
    direction is not read as an amount of this one; a page wholly of the other direction is skipped (returned
    as its number). A scope with no section title on any page is returned as it is. The third value is the pages
    that were divided by section titles: their direction is decided by the sections, not by a whole-page title
    (a `歳入` heading above the `収入` and `支出` sections must not make the page a revenue page).
    A title counts only when a table's top rule lies just under it: a note in the margin that says `支出` is none."""
    if direction is None:
        return printed, [], set()
    def titles_of(page: Page) -> list[tuple[float, str]]:
        # A title set apart (`収 入`) is read as one word per character: the words of a line at the left margin.
        lines: list[list[Word]] = []
        for word in sorted((w for w in page.words if w.x0 < page.width * .2), key=lambda w: (w.y0, w.x0)):
            if lines and abs(lines[-1][0].y0 - word.y0) <= 2:
                lines[-1].append(word)
            else:
                lines.append([word])
        tops = [r.y0 for r in page.rules if not r.vertical]
        return sorted(((line[0].y0 + line[0].y1) / 2, SECTION_TITLES[key]) for line in lines
                      if (key := normalize(''.join(w.text for w in sorted(line, key=lambda w: w.x0)))) in SECTION_TITLES
                      and any(line[0].y1 - 2 <= y <= line[0].y1 + SECTION_TITLE_REACH for y in tops))

    titled = {page.number: titles_of(page) for page in printed}
    if not any(titled.values()):
        return printed, [], set()
    kept, skipped, current = [], [], None
    for page in sorted(printed, key=lambda p: p.number):
        found = titled[page.number]
        starts = [centre - 8 for centre, _ in found]
        # what is above the first title goes on with the section before; each title opens the next section
        spans = [(float('-inf'), starts[0] if found else float('inf'), current)]
        spans += [(start, starts[i + 1] if i + 1 < len(starts) else float('inf'), kind)
                  for i, (start, (_, kind)) in enumerate(zip(starts, found))]
        if found:
            current = found[-1][1]
        wanted = [(top, bottom) for top, bottom, kind in spans if kind in (None, direction)]
        if not wanted:
            skipped.append(page.number)
            continue
        inside = lambda y: any(top <= y < bottom for top, bottom in wanted)
        rules = []
        for rule in page.rules:
            if rule.vertical:
                low, high = sorted((rule.y0, rule.y1))
                rules += [Rule(rule.x0, max(low, top), rule.x1, min(high, bottom)) for top, bottom in wanted
                          if min(high, bottom) - max(low, top) > 1]
            elif inside(rule.y0):
                rules.append(rule)
        kept.append(Page(page.number, page.width, page.height, [w for w in page.words if inside((w.y0 + w.y1) / 2)], rules))
    return kept, skipped, {number for number, found in titled.items() if found}


def read_units(observed: list[Page], readings: list[dict] | None) -> list[Page]:
    """Unit marks OCR misread, as the conversion's options declare them from the rendered page
    (`unit_readings`: page, box in PDF points, the one glyph read). The glyph becomes the unit 円, which is
    no amount; one glyph must sit in the box, or the conversion stops."""
    words = {p.number: list(p.words) for p in observed}
    for reading in readings or ():
        x0, y0, x1, y1 = reading['box']
        found = [i for i, w in enumerate(words.get(reading['page'], ())) if w.text == reading['observed']
                 and x0 <= (w.x0 + w.x1) / 2 <= x1 and y0 <= (w.y0 + w.y1) / 2 <= y1]
        if len(reading['observed']) != 1 or any(c.isdigit() for c in reading['observed']) or len(found) != 1:
            raise ValueError(f'A unit reading needs one non-digit glyph in its box: {reading["id"]}')
        w = words[reading['page']][found[0]]
        words[reading['page']][found[0]] = Word('円', w.x0, w.y0, w.x1, w.y1)
    return [Page(p.number, p.width, p.height, words[p.number], p.rules) for p in observed]


def recover_codes(observed: list[Page], pdf: Path, columns: dict | None = None,
                  *, spread: dict | None = None, header: dict | None = None) -> tuple[list[Page], list[dict]]:
    """Read a thin vertical 1 only inside a sequence hole. No whole-page ink check or inferred number.

    The component must have digit height, be narrow, stay off the crop edges, and be
    separate from the name. Other digits and ambiguous marks are left for explicit OCR.
    """
    from ingestion.lib.scan_ocr import missed_ink
    holes = [h for h in code_holes(_layout(observed, columns, spread=spread, header=header)) if h['expected'] == 1]
    images, filled, words = {}, [], {p.number: list(p.words) for p in observed}
    last_hole = {h['page']: index for index, h in enumerate(holes)}
    for index, hole in enumerate(holes):
        if index and last_hole[holes[index - 1]['page']] == index - 1:
            del images[holes[index - 1]['page']], image
        number = hole['page']
        if number not in images:
            images[number] = pdf_rules.render(pdf, number)
        image = images[number]
        page_ = next(p for p in observed if p.number == number)
        scale = page_.width / image.shape[1]
        x0, y0, x1, y1 = hole['box']
        left, top = max(0, int(x0 / scale)), max(0, int(y0 / scale))
        right, bottom = min(image.shape[1], int(x1 / scale) + 1), min(image.shape[0], int(y1 / scale) + 1)
        crop = image[top:bottom, left:right] < pdf_rules.DARK
        marks = missed_ink(crop, scale, [])
        thin = [m for m in marks if m[2] - m[0] <= .28 * (m[3] - m[1])
                and .6 * hole['height'] <= m[3] - m[1] <= 1.3 * hole['height']
                and m[0] > scale and m[2] < crop.shape[1] * scale - scale]
        if len(thin) != 1:
            continue
        m = thin[0]
        # A name's stroke, bracket, or numeral fragment touching other ink is not an isolated digit.
        if any(other != m and other[0] - m[2] < .3 * hole['height'] for other in marks):
            continue
        box = (m[0] + left * scale, m[1] + top * scale, m[2] + left * scale, m[3] + top * scale)
        # A tight crop can make a long vertical rule look digit-height. Its detected
        # continuation outside the crop is geometric evidence that this ink is a rule.
        if any(r.x0 == r.x1 and r.y0 <= box[1] and r.y1 >= box[3]
               and abs(r.x0 - (box[0] + box[2]) / 2) <= max(1.0, box[2] - box[0]) for r in page_.rules):
            continue
        if any(re.search(r'[0-9]', w.text) and w.x0 - .5 <= box[0] <= w.x1 + .5
               and w.y0 - .5 <= (box[1] + box[3]) / 2 <= w.y1 + .5 for w in words[number]):
            continue
        words[number].append(Word('1', *box))
        filled.append({**hole, 'box': box, 'kind': 'recovered subject code'})
    return [Page(p.number, p.width, p.height, words[p.number], p.rules) for p in observed], filled


def amount_dictionary(rules: list[dict]) -> AmountDictionary | None:
    return (AmountDictionary(hashlib.sha256(json.dumps(rules, ensure_ascii=False, sort_keys=True).encode()).hexdigest(),
                             tuple(AmountRule(**r) for r in rules)) if rules else None)


def declared_unread(built, logicals_: list, columns: dict | None, observation: dict | None = None) -> None:
    """Known unread money glyphs/ink must not silently disappear as empty cells."""
    from ingestion.generic.layout import is_amount
    units = logical_units(logicals_)
    for logical in logicals_:
        for band in logical.bands:
            if (columns or {}).get('／'.join(band.header), {}).get('kind') != 'amount':
                continue
            for glyph in band.words:
                # A lone sign (`△`) is printed over its figure, and the builder reads it so (`tree`): not unread.
                if (len(glyph.text.strip()) == 1 and not any(c.isdigit() for c in glyph.text) and glyph.text != '円'
                        and glyph.text.strip() not in SIGNS
                        and glyph.text not in DASHES
                        and not is_amount(glyph.text)
                        and (glyph.page, glyph.original) not in units):
                    built.unowned.append({'kind': 'unreadable declared amount cell', 'page': glyph.page,
                                          'text': glyph.text, 'box': glyph.original})
    for page_ in (observation or {}).get('pages', []):
        for box in page_.get('unread_ink', []):
            cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
            unit = any(p == page_['page_number'] and abs(cy - (b[1] + b[3]) / 2) <= 2
                       and b[0] - 3 <= cx <= b[2] + 3 for p, b in units)
            if not unit and any(b.page == page_['page_number'] and b.kind == 'amount'
                                and b.x0 - b.offset < cx < b.x1 - b.offset and b.body_top < cy < b.body_bottom
                                for logical in logicals_ for b in logical.bands):
                built.unowned.append({'kind': 'unread ink in amount column', 'page': page_['page_number'], 'box': box})
        # A line the strip seam cut and no single re-read gave back (`settle_seams`) stops the conversion in any
        # column: a name has no tree check, so a name cut short would pass.
        # A line outside every ruled frame of the page (the note printed under a table) holds no amount or name of it.
        for box in page_.get('unread_seams', []):
            centre = (box[1] + box[3]) / 2
            if not any(b.page == page_['page_number'] and (b.top if b.top is not None else b.body_top) <= centre <= b.body_bottom
                       for logical in logicals_ for b in logical.bands):
                continue
            if not any(u.get('page') == page_['page_number'] and u.get('box') == box for u in built.unowned):
                built.unowned.append({'kind': 'unread strip seam', 'page': page_['page_number'], 'box': box})


def pinned(source: dict, selected_pages: list[int]) -> dict:
    """Combine declared observations; enforce origin, page ownership, and the selection's scope."""
    observed = {}
    for item in source.get('ocr', []):
        observation = json.loads(gzip.decompress(Path(item['path']).read_bytes()))
        if observation['origin']['sha256'] != source['sha256']:
            raise ValueError(f'OCR input {item["id"]} reads another original')
        for p in observation['pages']:
            number = p['page_number']
            if number in observed:
                raise ValueError(f'Page {number} is read by more than one OCR input')
            observed[number] = {**p, 'engine': observation['request'].get('engine')}  # the engine that read the page
    missing = set(selected_pages) - observed.keys()
    if missing:
        raise ValueError(f'No pinned OCR for pages {sorted(missing)}')
    return {'pages': [observed[p] for p in selected_pages]}


def read_pages(source: dict, options: dict, settings: dict | None, selected: list[int],
               rules: dict | None = None, rule_hook=None, keep_marks: bool = False) -> tuple[list[Page], dict, list[str]]:
    """The pinned OCR of `selected` pages as generic pages, with the conversion's declared rereads laid in
    (dropped readings, name corrections bound to an observation, the variant characters Paddle reads, amount and code
    corrections, readings of what OCR left unread, unit readings), and the variant characters it replaced. A text
    document's OCR pages (`mixed.py`) are read by this too."""
    observation = drop_readings(pinned(source, selected), options.get('dropped_readings'))
    columns = (settings or {}).get('columns')
    spread = (settings or {}).get('spread')
    header = (settings or {}).get('header')
    # A name correction binds to an observation (`observation_id`: characters OCR misread) or, as the text
    # builder's, to a node by page, code and the name read (convert.correct_names).
    by_observation = [r for r in options.get('name_corrections', ()) if 'observation_id' in r]
    observation = apply_name_corrections(observation, by_observation)
    observation, variants = apply_variant_chars(observation)
    printed = pages(observation, Path(source['path']), amount_dictionary(options.get('amount_corrections', [])), columns, rules,
                    spread=spread, header=header, code_corrections=options.get('code_corrections'),
                    header_readings=options.get('header_readings'),
                    rule_dark=((settings or {}).get('rules') or {}).get('dark', pdf_rules.DARK), rule_hook=rule_hook,
                    keep_marks=keep_marks)
    printed = add_code_readings(printed, options.get('code_readings'))
    printed = add_code_readings(printed, [{**r, 'box': box} for r in options.get('amount_readings', ()) for box in r['boxes']],
                                'amount', r'△?(0|[1-9][0-9]{0,2}(,[0-9]{3})*)')
    return read_units(printed, options.get('unit_readings')), observation, variants


def build_table(source: dict, options: dict, *, stop: bool = True, rules: dict | None = None):
    """The scan entry of the same builder and finalization as text; the converter never runs OCR or VLM."""
    from ingestion.generic.build import choose_pattern, page_titles
    from ingestion.generic.convert import Table, canonical_headings, correct_names, excluded_regions, fine_sections, scope_pages, split_notes
    from ingestion.generic.layout_settings import load
    from ingestion.generic.repair import Report
    from ingestion.generic.units import check as check_units
    if source.get('format') != 'pdf' or source.get('pdf_type') != 'scan':
        raise ValueError('The scan builder requires a scan PDF')
    selected = scope_pages(source, options['account'], options.get('pages'))
    settings = load(source['target'], source.get('direction') or 'expenditure')
    columns = (settings or {}).get('columns')
    spread = (settings or {}).get('spread')
    header = (settings or {}).get('header')
    by_node = [r for r in options.get('name_corrections', ()) if 'observation_id' not in r]
    printed, observation, variants = read_pages(source, options, settings, selected, rules)
    printed, other_sections, sectioned = direction_sections(printed, source.get('direction'))
    printed, recovered = recover_codes(printed, Path(source['path']), columns, spread=spread, header=header)
    report = Report()
    direction = source.get('direction')
    titles = page_titles([p for p in printed if p.number not in sectioned]) if direction else {}
    report.skipped_pages = [p for p, title in titles.items() if title not in (None, direction)] + other_sections
    observed = [p for p in printed if p.number not in report.skipped_pages]
    logical = _layout(observed, columns, spread=spread, header=header)
    kind = source['target']['document_kind']
    built, report.pattern = choose_pattern(logical, kind, layout=(settings or {}).get('breakdown'))
    declared_unread(built, logical, columns, observation)
    built.notes.extend(recovered)
    report.unit = check_units(built, kind, options['account'], bool(options.get('partial')))
    if report.unit['stopped'] and stop:
        raise ValueError(f'Unit check failed: {report.unit}')
    kept, notes, amounts, unresolved, codes = split_notes(built)
    built.notes.extend({'kind': 'name correction', 'text': text} for text in correct_names(built.nodes, by_node))
    built.notes.extend({'kind': 'variant characters', 'text': text} for text in variants)
    nodes = [*built.nodes, *notes]
    amounts, headings = canonical_headings([*kept, *amounts], nodes, kind, header)
    fine_sections(nodes)
    return Table(nodes, amounts, unresolved, excluded_regions(built, logical, codes, observed),
                 built, report, observed, logical, headings)


def near_code(first: str | None, second: str | None) -> bool:
    """Two printings of one code, or a code and its OCR misreading: equal as numbers (`02` and `2`), or one
    digit dropped or added at either end (`10` read `1`, `3` read `13`, 132055). A code not read is no evidence
    against it."""
    if second is None or first is None:
        return True
    if first == second or (first.isdigit() and second.isdigit() and int(first) == int(second)):
        return True
    a, b = sorted((first.lstrip('0') or '0', second.lstrip('0') or '0'), key=len)
    return len(b) - len(a) == 1 and (b.startswith(a) or b.endswith(a))


def misread_repeat(previous_code: str | None, previous_name: str, code: str | None, name: str) -> bool:
    """A subject line OCR misread that still repeats the open heading of its level on a continuation page.

    Codes only (`10 2 3` at the top of a page, or with a one-character scrap beside them, `10 -`, 132101):
    a near code (`near_code`). With a name of three characters or more, both the code and name must agree
    within those OCR errors (`13 小学校特別支援教育費` for `3`). Similar names with distinct codes are
    separate subjects, such as 常備消防費 and 非常備消防費."""
    from ingestion.generic.layout import normalize
    from ingestion.generic.tree import same_heading
    if len(normalize(name or '')) < 2:
        return near_code(previous_code, code)
    return near_code(previous_code, code) and len(normalize(name)) >= 3 and same_heading(previous_name, name)


def dense_limit(values: list[float]) -> float:
    """The right limit of a breakdown's names under OCR: the rightmost end that enough lines reach.

    Many long names reach the limit; a few lines run past it because OCR read an amount into the label
    (`度任用職員報酬2人4,26L400`, 132101). Printed text uses the longest line (`tree.line_limits`)."""
    values = sorted(values)
    enough = max(3, len(values) // 200)
    reached = [v for i, v in enumerate(values) if i + 1 >= enough and v - values[i + 1 - enough] <= 3]
    return reached[-1] if reached else values[-1]


def line_reach(money: list, line: list) -> float:
    """A small OCR ink box (notably a zero) is aligned with a full text-line box.

    Their centres may differ although the prints share a line; use the larger glyph height.
    This changes line matching only, never the recorded positions or the amount's value.
    """
    return .6 * max(g.y1 - g.y0 for g in [*money, *line])


def total_row(label: str) -> bool:
    """A total word alone on a line under OCR (`計 449,855,116` closing a 備考, 132055): a total row, though
    the shared dictionary knows `予算現額／計` as an amount kind. Printed text stacks `補正予算額` / `計` as
    kinds in one cell (132063), so this stays with OCR."""
    from ingestion.generic.tree import TOTAL
    return TOTAL.fullmatch(label) is not None
