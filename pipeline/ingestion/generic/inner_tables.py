"""Blocks printed under a subject row across the amount columns (the layout setting `inner_tables`).

131199 prints, under each 目 of its 決算 detail, a block that runs from the 目 column to the right frame: a
事業説明 in prose and a boxed table `事務事業 | 予算現額 | 決算額`, whose rows are the 目's 事業 and, indented
below each, the 課 that spent it. The amount columns' rules stop over the block, so read as columns its words
would fall into the 目's amount columns. The block is cut out of the page before the columns are read
(`cut`), and the boxed table is read on its own (`rows`) and laid under the subject above it as a breakdown on
the axis of its first column's header (`attach`). A block runs on over a page break; its table prints its header
again on the next page, and its rows keep their levels across the break.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace
import hashlib
import re

from ingestion.generic.layout import normalize
from ingestion.generic.observe import Page, Rule, Word

CODE = re.compile(r'^([0-9]+|[(（][0-9]+[)）])\s*')
YEN_AMOUNT = re.compile(r'△?[0-9]{1,3}(,[0-9]{3})*')
# One step of indentation is a character (about 9pt); words of one level start within this.
SAME_LEVEL = 3.0
# A wrapped name's second line starts up to a character and a half right of the name above it (`(P106)` 9pt in);
# a row one level deeper starts two and a half characters in (the 課 under a 事業, 26pt).
WRAP_SLACK = 14.0


@dataclass
class Block:
    page: int
    top: float
    bottom: float
    left: float
    words: list[Word] = field(default_factory=list)
    rules: list[Rule] = field(default_factory=list)


@dataclass
class Row:
    page: int
    code: str | None
    name: str
    box: tuple[float, float, float, float]
    amounts: list[tuple[str, str, tuple[float, float, float, float]]]
    indent: float
    start: float  # where the name starts, after its number


def _vertical(rule: Rule) -> bool:
    return abs(rule.x0 - rule.x1) < 1


def _word(page: Page, text: str) -> Word | None:
    found = [w for w in page.words if normalize(w.text) == text]
    return min(found, key=lambda w: w.y0) if found else None


def blocks_of(page: Page, setting: dict) -> list[Block]:
    """The blocks of a page that prints the marker header: where the rule left of the marker stops."""
    marker, left = _word(page, setting['marker']), _word(page, setting['left'])
    if marker is None or left is None:
        return []
    verticals = [r for r in page.rules if _vertical(r)]
    before = [r.x0 for r in verticals if left.x1 < r.x0 < marker.x0 and r.y0 <= marker.y0 and marker.y1 <= r.y1]
    edges = [r.x0 for r in verticals if r.x0 < left.x0 and r.y0 <= left.y0 and left.y1 <= r.y1]
    if not before or not edges:
        return []
    x, left_x = max(before), max(edges)
    frame = [r for r in verticals if abs(r.x0 - min(edges)) < 1]
    bottom = max(r.y1 for r in frame)
    spans = sorted((r.y0, r.y1) for r in verticals if abs(r.x0 - x) < 1)
    found, reach = [], spans[0][1]
    for y0, y1 in spans[1:] + [(bottom, bottom)]:
        if y0 - reach > 2:
            found.append(Block(page.number, reach, y0, left_x))
        reach = max(reach, y1)
    return found


def cut(pages: list[Page], setting: dict) -> tuple[list[Page], list[Block]]:
    """The pages without their blocks' words and rules, and the blocks."""
    kept, blocks = [], []
    for page in pages:
        found = blocks_of(page, setting)
        if not found:
            kept.append(page)
            continue

        def inside(x: float, y: float) -> Block | None:
            return next((b for b in found if b.top < y < b.bottom and x > b.left + 1), None)

        words, rules = [], []
        for word in page.words:
            block = inside((word.x0 + word.x1) / 2, (word.y0 + word.y1) / 2)
            (block.words if block else words).append(word)
        for rule in page.rules:
            if _vertical(rule):
                block = inside(rule.x0, (rule.y0 + rule.y1) / 2)
                if block and block.top - 1 <= rule.y0 and rule.y1 <= block.bottom + 1:
                    block.rules.append(rule)
                    continue
            else:
                block = next((b for b in found if b.top + 1 < rule.y0 < b.bottom - 1 and rule.x0 > b.left + 1), None)
                if block:
                    block.rules.append(rule)
                    continue
            rules.append(rule)
        for block in found:
            # The unit marks of the amount columns (`円`) head the body of a page that a block runs on to: the
            # columns' own, though the block's rows leave them no rule.
            boxes = tables(block)
            units = [w for w in block.words if normalize(w.text) == '円'
                     and not any(top - 1 <= (w.y0 + w.y1) / 2 <= bottom + 1 for _, top, bottom in boxes)]
            block.words = [w for w in block.words if w not in units]
            words.extend(units)
        kept.append(replace(page, words=words, rules=rules))
        blocks.extend(found)
    return kept, blocks


def _lines(words: list[Word]) -> list[list[Word]]:
    lines: list[list[Word]] = []
    for word in sorted(words, key=lambda w: ((w.y0 + w.y1) / 2, w.x0)):
        middle = (word.y0 + word.y1) / 2
        if lines and abs(middle - sum((w.y0 + w.y1) / 2 for w in lines[-1]) / len(lines[-1])) <= 3:
            lines[-1].append(word)
        else:
            lines.append([word])
    return [sorted(line, key=lambda w: w.x0) for line in lines]


def _box(words: list[Word]) -> tuple[float, float, float, float]:
    return (min(w.x0 for w in words), min(w.y0 for w in words), max(w.x1 for w in words), max(w.y1 for w in words))


def tables(block: Block) -> list[tuple[list[float], float, float]]:
    """The boxed tables of a block: the x of their column rules and their top and bottom."""
    found: list[tuple[list[float], float, float]] = []
    for rule in sorted((r for r in block.rules if _vertical(r)), key=lambda r: (r.y0, r.x0)):
        same = next((t for t in found if abs(t[1] - rule.y0) <= 2 and abs(t[2] - rule.y1) <= 2), None)
        if same:
            same[0].append(rule.x0)
        else:
            found.append(([rule.x0], rule.y0, rule.y1))
    return [(sorted(xs), top, bottom) for xs, top, bottom in found if len(xs) >= 3]


def _start(name: list[Word], code: str | None) -> float:
    """Where a row's name starts: the word after its number, or its number's share of a word that holds both."""
    first = name[0]
    if code is None:
        return first.x0
    shown = normalize(first.text)
    if shown == code and len(name) > 1:
        return name[1].x0
    return first.x0 + (first.x1 - first.x0) * len(code) / max(len(shown), 1)


def rows(block: Block, heading: str) -> tuple[list[Row], list[Word], list[str], list[Word]]:
    """The rows of the block's boxed table headed `heading`, the words outside any such table, the headers
    of its amount columns, and the words of the tables ruled inside its first column (the 件数・費用額 of a
    事業, 131199's 療養給付経費): figures of the 事業, no rows of the table."""
    outside = list(block.words)
    found, headers, figures = [], [], []
    for xs, top, bottom in tables(block):
        within = [w for w in block.words if top - 1 <= (w.y0 + w.y1) / 2 <= bottom + 1 and xs[0] - 1 <= (w.x0 + w.x1) / 2 <= xs[-1] + 1]
        nested = [(r.y0, r.y1) for r in block.rules if _vertical(r) and xs[0] + 2 < r.x0 < xs[1] - 2
                  and top - 1 <= r.y0 and r.y1 <= bottom + 1]
        inside = [w for w in within if (w.x0 + w.x1) / 2 < xs[1]
                  and any(y0 <= (w.y0 + w.y1) / 2 <= y1 for y0, y1 in nested)]
        lines = _lines([w for w in within if w not in inside])
        if not lines:
            continue

        def cells(line: list[Word]) -> list[list[Word]]:
            return [[w for w in line if a <= (w.x0 + w.x1) / 2 < b] for a, b in zip(xs, xs[1:])]

        head = [normalize(''.join(w.text for w in cell)) for cell in cells(lines[0])]
        if head[0] != heading:
            continue
        outside = [w for w in outside if w not in within]
        headers = head[1:]
        figures.extend(inside)
        for line in lines[1:]:
            name, *money = cells(line)
            amounts = []
            for header, cell in zip(head[1:], money):
                text = re.sub(r'[\s円]', '', ''.join(w.text for w in cell))
                if not text:
                    continue
                digits = re.sub(r'[^0-9]', '', text)
                shown = ('△' if text.startswith('△') else '') + (f'{int(digits):,}' if digits else '')
                if not digits or not YEN_AMOUNT.fullmatch(shown) or re.sub(r'[0-9,.△]', '', text):
                    raise ValueError(f'An inner table cell is no amount: {block.page}頁 {text!r}')
                amounts.append((header, shown, _box(cell)))
            if not name:
                if found and found[-1].page == block.page and not found[-1].amounts and amounts:
                    found[-1].amounts = amounts  # a wrapped name's amounts on its last line
                    continue
                raise ValueError(f'An inner table row has amounts but no name: {block.page}頁 {amounts}')
            joined = ''.join(w.text for w in name)
            code = CODE.match(normalize(joined))
            if (not amounts and code is None and found and found[-1].page == block.page
                    and name[0].x0 <= found[-1].start + WRAP_SLACK):
                # The second line of a wrapped name starts under the name (`(P106)`); a numbered line, or one set
                # further right, is a row of its own that prints no amount (the 課 under a 事業 that prints its
                # amounts alone).
                found[-1].name += normalize(joined)
                found[-1].box = _box([*name, Word('', *found[-1].box)])
                continue
            found.append(Row(block.page, code.group(1) if code else None,
                             normalize(joined)[code.end():] if code else normalize(joined),
                             _box(name), amounts, name[0].x0, _start(name, code.group(1) if code else None)))
    return found, outside, headers, figures


def in_prose(blocks: list[Block], page: int, box) -> bool:
    """A box that lies in a block's prose, outside its boxed tables: no amount column's."""
    x, y = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    return any(b.page == page and b.top < y < b.bottom and x > b.left + 1
               and not any(xs[0] - 1 <= x <= xs[-1] + 1 and top - 1 <= y <= bottom + 1 for xs, top, bottom in tables(b))
               for b in blocks)


def node_key(page: int, box: tuple[float, float, float, float], axis: str) -> str:
    return 'n-' + hashlib.sha256(f'{page}:{box[0]:.2f}:{box[1]:.2f}:{axis}'.encode()).hexdigest()[:24]


def attach(built, blocks: list[Block], setting: dict, unit: str = '円') -> tuple[list[tuple[int, Word]], list[tuple[int, Word]]]:
    """Lay the boxed tables' rows under the subject above each block, as a breakdown on the axis `heading`.
    The words of the blocks outside the tables (the prose) and the words of the figures ruled inside a table's
    first column are returned for the coverage check."""
    axis = setting['heading']
    subjects = sorted((n for n in built.nodes if n.get('level_header')), key=lambda n: (n['physical_page'], n['y0']))
    prose: list[tuple[int, Word]] = []
    figures: list[tuple[int, Word]] = []
    stack: list[tuple[float, dict]] = []
    owner = None
    for block in sorted(blocks, key=lambda b: (b.page, b.top)):
        above = [n for n in subjects if (n['physical_page'], n['y0']) < (block.page, block.top)]
        if not above:
            raise ValueError(f'An inner block has no subject above it: {block.page}頁')
        if above[-1] is not owner:
            owner, stack = above[-1], []
        found, outside, _, inside = rows(block, axis)
        prose.extend((block.page, w) for w in outside)
        figures.extend((block.page, w) for w in inside)
        for row in found:
            while stack and stack[-1][0] >= row.indent - SAME_LEVEL:
                stack.pop()
            parent = stack[-1][1] if stack else owner
            key = node_key(row.page, row.box, axis)
            node = {'node_key': key, 'parent_node_key': parent['node_key'], 'axis_header': axis,
                    'depth': len(stack) + 1, 'level_header': None, 'code_text': row.code, 'name_text': row.name,
                    'physical_page': row.page, 'x0': row.box[0], 'y0': row.box[1], 'x1': row.box[2], 'y1': row.box[3]}
            built.nodes.append(node)
            for header, text, box in row.amounts:
                built.amounts.append({'node_key': key, 'header_path': header, 'amount_text': text, 'unit_text': unit,
                                      'physical_page': row.page, 'x0': box[0], 'y0': box[1], 'x1': box[2], 'y1': box[3]})
            stack.append((row.indent, node))
    return prose, figures
