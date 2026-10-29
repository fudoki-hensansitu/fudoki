from collections import Counter, defaultdict
import re
from ingestion.generic.layout import SUBJECT_LEVELS
from ingestion.generic.tree import subject_header


def select(bands):
    labels = [b for b in bands if b.kind == "label"]
    subject_bands = []
    subject_band = lambda b: bool(b.header) and (subject_header(b.header) or b.axis_header == '科目')
    for band in labels:
        if subject_band(band):
            subject_bands = [band]
            index = bands.index(band)
            while index + 1 < len(bands) and bands[index + 1].kind == 'label' and (
                    bands[index + 1].header == band.header or subject_band(bands[index + 1])):
                index += 1
                subject_bands.append(bands[index])
            break
    return subject_bands, "indent", None


def alignment(all_items, codes_right):
    # Codes set right in their column: a one-digit and a two-digit code of one level start a digit apart (4–6pt).
    # A wider spread is names or other levels sharing the column, not alignment.
    code_starts: dict[int, list[float]] = defaultdict(list)
    digit_widths: dict[int, list[float]] = defaultdict(list)
    for _, ordered, found in all_items:
        for group in ordered:
            if group.subject and group.mode == 'indent':
                for item in found[id(group)]:
                    if item.code is not None and item.role == 'node' and item.glyphs:
                        code_starts[item.level].append(item.glyphs[0].x0)
                        if len(item.glyphs[0].text) == 1:
                            digit_widths[item.level].append(item.glyphs[0].x1 - item.glyphs[0].x0)
    # Codes set right across the whole subject column (a 款 `5` and `10` of nested boxes): a two-digit code starts
    # one digit before a one-digit code of its level, so it is read at the position the one-digit codes start.
    ones = [item.glyphs[0] for _, ordered, found in all_items for group in ordered
            if group.subject and group.mode == 'indent' for item in found[id(group)]
            if item.code is not None and item.role == 'node' and item.glyphs and re.fullmatch(r'[0-9]', item.glyphs[0].text)]
    twos = [item.glyphs[0] for _, ordered, found in all_items for group in ordered
            if group.subject and group.mode == 'indent' for item in found[id(group)]
            if item.code is not None and item.role == 'node' and item.glyphs and re.fullmatch(r'[0-9]{2}', item.glyphs[0].text)]
    one_width = sorted(g.x1 - g.x0 for g in ones)[len(ones) // 2] if ones else 0
    starts_of_ones = [g.x0 for g in ones]
    set_right = sum(any(abs(g.x0 + one_width - x) <= 1 for x in starts_of_ones) for g in twos)
    set_left = sum(any(abs(g.x0 - x) <= 1 for x in starts_of_ones) for g in twos)
    codes_set_right = codes_right and one_width > 0 and set_right >= 3 and set_right > 2 * set_left
    right_set = set()
    for level, xs in code_starts.items():
        common = [x for x, n in Counter(round(x) for x in xs).items() if n >= 3]  # a stray start is not a column
        # Set right, a one-digit code starts one digit (as wide as the font sets it) after a two-digit one.
        digit = max(digit_widths[level], default=0)
        gap = max(common) - min(common) if common else 0
        if common and 3 < gap and (gap <= 6.5 or abs(gap - digit) <= .6):
            right_set.add(level)
    return one_width, codes_set_right, right_set


def align(logical, group, kept, alignment):
    one_width, codes_set_right, right_set = alignment
    # Join at the name's position before learning subject levels from the code's start.
    for item in kept:
        # The code leads the item: a name set a few points above its code's line (OCR) is not the start.
        item.indent = min(g.x0 for g in item.glyphs) if logical.ocr else item.glyphs[0].x0
        band = group.bands[item.level] if 0 <= item.level < len(group.bands) else None
        narrow = len(group.bands) >= 3 and all(b.x1 - b.x0 < 20 for b in group.bands[:-1])
        if codes_set_right and item.code is not None and re.fullmatch(r'[0-9]{1,2}', item.glyphs[0].text):
            item.indent += one_width if len(item.glyphs[0].text) == 2 else 0
        elif band is not None and item.code is not None and narrow and item.level in right_set:
            # A staircase of narrow level columns with the codes set right: the column is the level,
            # not where the digits start (`5` and `10` of one 目 start 5pt apart).
            item.indent = band.x0


def learn_levels(all_items):
    # Subject levels by indentation, learned over the document (pattern indent).
    nodes_ = [i for _, ordered, found in all_items for g in ordered if g.subject and g.mode == 'indent'
              for i in found[id(g)] if i.role == 'node']
    # Where the codes start decide the levels; the names a continuation page prints again without their codes
    # sit elsewhere (their box is open, its code is not printed) and are no level of their own.
    coded_ = [i for i in nodes_ if i.code is not None]
    # A scan's levels (every page OCR; a text document with a few OCR pages keeps its own) are measured from the left edge of the subject column: its frame sits a few points elsewhere
    # on each page, and the same level must not start at two values.
    ocr_groups = {id(g) for logical, ordered, _ in all_items for g in ordered} if all(l.ocr for l, _, _ in all_items) else set()
    def cluster(edge):
        starts = sorted(edge(i) for i in (coded_ if len(coded_) >= max(3, len(nodes_) // 2) else nodes_))
        found_levels: list[list[float]] = []
        for value in starts:
            if found_levels and value - found_levels[-1][-1] <= 3:
                found_levels[-1].append(value)
            else:
                found_levels.append([value])
        # A start printed once is a stray one. A table that prints one 款・項・目 chain has no level twice: keep its
        # starts (132063 公共用地, 款 項 目 of one name), or every line is level 0 and the chain reads as one repeated heading.
        kept_levels = [c for c in found_levels if len(c) >= max(2, len(starts) // 100)]
        return kept_levels or found_levels
    edge = lambda i: i.indent - (i.group.bands[0].x0 if id(i.group) in ocr_groups else 0)
    subject_levels = cluster(edge)
    if not ocr_groups:
        # The frame of a text page sits a few points elsewhere on some pages (132063 競走事業会計: 款 at 51 and 57), and one
        # level then starts at two values. Measured from the subject column's left edge, a document whose frame
        # drifts has fewer levels; one whose frame is steady has as many, and keeps its own starts.
        from_edge = lambda i: i.indent - i.group.bands[0].x0
        relative = cluster(from_edge)
        if len(relative) < len(subject_levels):
            subject_levels, edge = relative, from_edge
    centres = [sum(c) / len(c) for c in subject_levels]
    for _, ordered, found in all_items:
        for group in ordered:
            if group.subject and group.mode == 'indent':
                group.levels = len(centres) or 1
                for item in found[id(group)]:
                    item.level = min(range(len(centres)), key=lambda i: abs(centres[i] - edge(item))) if centres else 0
                    item.level_name = SUBJECT_LEVELS[item.level] if item.level < len(SUBJECT_LEVELS) else None
