"""Stages 4–5: items, left–right ownership of amounts, and the tree.

* Label groups: neighbouring label bands whose header leaves are 款・項・目 form
  the subject axis (科目). Every other label band is its own axis, named by the
  lowest header cell that spans it together with its amount bands.
* Items: in a label group, a printed code or an amount starts an item; other
  lines continue it. A rule-bounded cell holding one code is one item, so a code
  printed beside a wrapped name joins it.
* Left–right: an amount in an amount band belongs to the item, in the nearest
  label group to its left, whose first line lies in the amount's rule-bounded
  row. An amount inside a label band belongs to the item on its own line.
* Up–down: subject depth is the 款・項・目 band where the code starts. Other axes
  rank the indentation of the name start, learned over the document. Parents are
  the nearest shallower open item; the roots of other axes hang under the open
  subject item. A subject code equal to the open one at that depth repeats it.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field
import hashlib
import re

from ingestion.lib.node_tables import phase_dictionary
from ingestion.generic.layout import (SUBJECT_LEVELS, Band, Glyph, Logical, is_amount, lines, normalize,
                                      runs, text)

CODE = re.compile(r'^[(（]?([0-9０-９]{1,4})[)）]?(?=\D|$)')
TRANSFER = re.compile(r'(流用|充用|予備費支出|予備費充当|第[0-9０-９]+節[へか]|^第[0-9０-９]+[款項目節])')
TOTAL = re.compile(r'(合計|総計|^計$)')


@dataclass
class Group:
    bands: list[Band]
    axis: str
    subject: bool

    @property
    def x0(self) -> float:
        return self.bands[0].x0

    @property
    def x1(self) -> float:
        return self.bands[-1].x1


@dataclass
class Item:
    group: Group
    page: int
    lines: list[list[Glyph]]
    code: str | None
    name: str
    indent: float
    level: int | None = None  # subject band index
    amounts: list[tuple[str, list[Glyph]]] = field(default_factory=list)  # (header path, glyphs)
    role: str = 'node'  # node | note | total
    key: str | None = None
    parent: 'Item | None' = None
    depth: int | None = None
    fixed_anchor: float | None = None
    decided: bool = False  # role chosen by a judgment, not by the geometric rules

    @property
    def glyphs(self) -> list[Glyph]:
        return [g for line in self.lines for g in line]

    @property
    def y0(self) -> float:
        return min(g.y0 for g in self.glyphs)

    @property
    def y1(self) -> float:
        return max(g.y1 for g in self.glyphs)

    @property
    def anchor(self) -> float:
        """Vertical centre of the line that carries the code (or the first line)."""
        if self.fixed_anchor is not None:
            return self.fixed_anchor
        for line in self.lines:
            if self.code is not None and CODE.match(normalize(text(line))):
                return sum((g.y0 + g.y1) / 2 for g in line) / len(line)
        line = self.lines[0]
        return sum((g.y0 + g.y1) / 2 for g in line) / len(line)


def groups(logical: Logical) -> list[Group]:
    bands = sorted((b for b in logical.bands), key=lambda b: b.x0)
    result: list[Group] = []
    for index, band in enumerate(bands):
        if band.kind != 'label':
            continue
        subject = bool(band.header) and band.header[-1] in SUBJECT_LEVELS
        if subject and result and result[-1].subject and result[-1].bands[-1] is bands[index - 1]:
            result[-1].bands.append(band)
            continue
        if subject:
            result.append(Group([band], '科目', True))
            continue
        # The lowest header cell spanning this band and a neighbouring amount band.
        axis = band.header[-1] if band.header else '備考'
        for x0, x1, label in reversed(band.spans[:-1]):
            covered = [b for b in bands if x0 - 1 <= b.center <= x1 + 1]
            if any(b.kind == 'amount' for b in covered) and all(b is band or b.kind != 'label' for b in covered):
                axis = label
                break
        result.append(Group([band], axis, False))
    return result


def _split_code(line_text: str) -> tuple[str | None, str]:
    found = CODE.match(line_text)
    if not found:
        return None, line_text
    return found.group(1), line_text[found.end():].strip()


def _cell(band: Band, y: float) -> tuple[float, float]:
    above = [r for r in band.rows if r <= y + .5]
    below = [r for r in band.rows if r > y + .5]
    return (above[-1] if above else band.body_top, below[0] if below else band.body_bottom)


def _split_line(line: list[Glyph]) -> tuple[list[Glyph], list[list[Glyph]]]:
    parts = runs(line)
    money = []
    while parts and is_amount(text(parts[-1])) and len(parts) > 1:
        money.insert(0, parts.pop())
    if not money and parts:
        # A grouped amount printed flush against the name (`…】112,408,043`),
        # possibly starting inside a Poppler word: split that word proportionally.
        last = parts[-1]
        joined = text(last)
        found = re.match(r'^(.*[^0-9,△▲])([△▲]?[0-9]{1,3}(?:,[0-9]{3})+)$', joined)
        if found:
            cut, consumed = len(found.group(1)), 0
            for index, glyph in enumerate(last):
                if consumed + len(glyph.text) > cut:
                    inner = cut - consumed
                    if inner:
                        width = (glyph.x1 - glyph.x0) / len(glyph.text)
                        x = glyph.x0 + inner * width
                        head = Glyph(glyph.text[:inner], glyph.x0, glyph.y0, x, glyph.y1, glyph.page, glyph.offset)
                        tail = Glyph(glyph.text[inner:], x, glyph.y0, glyph.x1, glyph.y1, glyph.page, glyph.offset)
                        parts[-1], money = last[:index] + [head], [[tail] + last[index + 1:]]
                    else:
                        parts[-1], money = last[:index], [last[index:]]
                    break
                consumed += len(glyph.text)
    return [g for part in parts for g in part], money


def is_amount_kind(label: str) -> bool:
    """A printed amount kind (支出済額・繰越明許費・不用額…) rather than an item name."""
    known = {header for _, header in phase_dictionary()}
    return label in known or re.fullmatch(r'(翌年度)?(繰越明許費?|事故繰越し?|継続費逓次繰越|不用額|本年度支出額|支出済額)', label) is not None


def code_margins(logicals: list[Logical]) -> dict[str, set[int]]:
    """Left margins (rounded x) where printed codes start, per non-subject axis.

    A leading number counts as a code only at a margin where most lines start
    with one, so a name that begins with a digit (`3歳児…`) stays a name.
    """
    votes: dict[tuple[str, int], list[int]] = defaultdict(lambda: [0, 0])
    for logical in logicals:
        for group in groups(logical):
            if group.subject:
                continue
            for line in lines([w for band in group.bands for w in band.words]):
                label, _ = _split_line(line)
                if label:
                    coded = _split_code(normalize(text(label)))[0] is not None
                    for margin in _margins(label):
                        votes[group.axis, margin][0 if coded else 1] += 1
    margins: dict[str, set[int]] = defaultdict(set)
    for (axis, x), (coded, plain) in votes.items():
        if coded > plain:
            margins[axis].update({x - 1, x, x + 1})
    return margins


def _margins(label: list[Glyph]) -> tuple[int, int]:
    """Where a line starts, and where a leading number would end (codes align either way)."""
    first = label[0]
    raw = normalize(first.text)
    digits = len(raw) - len(raw.lstrip('0123456789'))
    width = (first.x1 - first.x0) / max(len(first.text), 1)
    return round(first.x0), 10000 + round(first.x0 + max(digits, 1) * width)


def entries_of(group: Group, margins: set[int] | None = None) -> list[tuple]:
    """Printed lines of a label group as (label glyphs, amount runs, code, name)."""
    entries = []
    for line in lines([w for band in group.bands for w in band.words]):
        label, money = _split_line(line)
        line_text = normalize(text(label))
        code, name = _split_code(line_text)
        if code is not None and margins is not None and not margins & set(_margins(label)):
            code, name = None, line_text  # a name that begins with a digit
        if code is not None and not name and money:
            code = None  # a lone number left of an amount is not a code
        entries.append((label, money, code, name))
    return entries


def items(group: Group, header: str, margins: set[int] | None = None,
          roles: dict[int, str] | None = None) -> list[Item]:
    """Lines of a label group into items; amounts printed inside the group stay on their item.

    `roles` (variant B) replaces the geometric decisions for codeless lines.
    """
    entries = entries_of(group, margins)
    result: list[Item] = []
    # A rule-bounded cell with exactly one code is one item.
    band_of = lambda g: next(b for b in group.bands if b.x0 <= (g.x0 + g.x1) / 2 <= b.x1 or b is group.bands[-1])
    cells: dict[tuple, list[int]] = defaultdict(list)
    for index, (label, money, code, name) in enumerate(entries):
        anchor = label[0] if label else money[0][0]
        y = (anchor.y0 + anchor.y1) / 2
        cells[_cell(band_of(anchor), y)].append(index)
    single = {i: tuple(ix) for ix in cells.values()
              if sum(entries[i][2] is not None for i in ix) == 1 and len(ix) > 1
              and sum(bool(entries[i][1]) for i in ix) <= 1 for i in ix}
    done: set[int] = set()
    for index, (label, money, code, name) in enumerate(entries):
        if index in done:
            continue
        if index in single:
            members = single[index]
            done.update(members)
            code_index = next(i for i in members if entries[i][2] is not None)
            all_lines = [entries[i][0] for i in members if entries[i][0]]
            name = ''.join(entries[i][3] if i == code_index else normalize(text(entries[i][0])) for i in members)
            item = Item(group, all_lines[0][0].page, all_lines, entries[code_index][2], name, 0)
            for i in members:
                for run in entries[i][1]:
                    item.amounts.append((header, run))
            _measure(item, entries[code_index][0], entries[code_index][2])
            result.append(item)
            continue
        previous = result[-1] if result else None
        if roles is not None and code is None and index in roles and label:
            role = roles[index]
            label_text = normalize(text(label))
            if role in ('continuation', 'amount_kind') and previous is not None:
                previous.lines.append(label)
                if role == 'continuation':
                    previous.name += label_text
                for run in money:
                    previous.amounts.append((header if role == 'continuation' else f'{header}／{label_text}', run))
                continue
            item = Item(group, label[0].page, [label], None, name, 0, decided=True)
            item.role = 'annotation' if role == 'note' else 'node'
            for run in money:
                item.amounts.append((header, run))
            _measure(item, label, None)
            result.append(item)
            continue
        whole = normalize(text(line_of(label, money)))
        if previous is not None and code is None and whole[:1] in '(（' and whole[-1:] in ')）':
            previous.lines.append(label + [g for run in money for g in run])
            previous.name += whole  # a parenthesised remark on the previous item, not an amount of it
            continue
        label_text = normalize(text(label))
        if previous is not None and code is None and money and is_amount_kind(label_text):
            for run in money:  # `繰越明許費 302,000`: an amount kind of the item above
                previous.amounts.append((f'{header}／{label_text}', run))
            previous.lines.append(label)
            continue
        wrapped = (previous is not None and code is None and label and not previous.amounts
                   and (not money or abs(label[0].x0 - previous.indent) <= 3)
                   and _cell(band_of(label[0]), label[0].y0) == _cell(band_of(previous.lines[-1][0]), previous.lines[-1][0].y0))
        if wrapped:  # a wrapped name; its amount may be printed on the last line
            previous.lines.append(label)
            previous.name += normalize(text(label))
            for run in money:
                previous.amounts.append((header, run))
            continue
        if not label:  # an amount alone on its line: a wrapped item's amount
            if result:
                for run in money:
                    result[-1].amounts.append((header, run))
            continue
        item = Item(group, label[0].page, [label], code, name, 0)
        for run in money:
            item.amounts.append((header, run))
        _measure(item, label, code)
        result.append(item)
    return result


def line_of(label: list[Glyph], money: list[list[Glyph]]) -> list[Glyph]:
    return sorted(label + [g for run in money for g in run], key=lambda g: g.x0)


def _measure(item: Item, label: list[Glyph], code: str | None) -> None:
    """Indentation is where the name starts; subject level is the band of the first glyph."""
    first = label[0]
    if code is not None:
        consumed, offset = 0, None
        raw = ''.join(g.text for g in label)
        found = CODE.match(normalize(raw))
        length = found.end() if found else 0
        for glyph in label:
            if consumed + len(glyph.text) > length:
                width = (glyph.x1 - glyph.x0) / max(len(glyph.text), 1)
                offset = glyph.x0 + (length - consumed) * width
                break
            consumed += len(glyph.text)
        item.indent = offset if offset is not None else label[-1].x1
    else:
        item.indent = first.x0
    if item.group.subject:
        cx = first.x0 + 1
        for index, band in enumerate(item.group.bands):
            if band.x0 - 1 <= cx <= band.x1:
                item.level = index
        item.level = item.level if item.level is not None else len(item.group.bands) - 1


def subject_items(group: Group) -> list[Item]:
    """Subject (款・項・目) items: a code printed in a level band starts an item.

    A line splits where a glyph run that starts with a code begins in a new
    band (`3 2 1`, `7 1商工費`); text without a code continues the current run
    even across bands (`1 議 会 費`). Name-only lines in the same rule-bounded
    cell belong to the deepest code of that cell (a name wrapped above and
    below its code); a cell without a code continues the previous item.
    """
    deepest = group.bands[-1]
    band_index = lambda g: next((i for i, b in enumerate(group.bands)
                                 if b.x0 <= g.x0 + min(2, (g.x1 - g.x0) / 2) <= b.x1), len(group.bands) - 1)
    cells: dict[tuple, list[list[Glyph]]] = defaultdict(list)
    order: list[tuple] = []
    for line in lines([w for band in group.bands for w in band.words]):
        y = sum((g.y0 + g.y1) / 2 for g in line) / len(line)
        cell = _cell(deepest, y)
        if cell not in cells:
            order.append(cell)
        cells[cell].append(line)
    result: list[Item] = []
    for cell in order:
        tokens: list[tuple[int, list[Glyph]]] = []
        names: list[list[Glyph]] = []
        for line in cells[cell]:
            pieces: list[tuple[int, list[Glyph]]] = []
            for glyph in line:
                band = band_index(glyph)
                starts_code = CODE.match(normalize(glyph.text)) is not None
                if pieces and not (band != pieces[-1][0] and starts_code):
                    pieces[-1][1].append(glyph)
                else:
                    pieces.append((band, [glyph]))
            for band, piece in pieces:
                if CODE.match(normalize(text(piece))):
                    tokens.append((band, piece))
                else:
                    names.append(piece)
        if not tokens:
            if result and names and result[-1].role == 'node' and _cell(deepest, result[-1].anchor) == cell:
                for piece in names:
                    result[-1].lines.append(piece)
                    result[-1].name += normalize(text(piece))
                continue
            for piece in names:  # a printed line without a code (a total row)
                item = Item(group, piece[0].page, [piece], None, normalize(text(piece)), 0)
                _measure(item, piece, None)
                result.append(item)
            continue
        target = max(range(len(tokens)), key=lambda i: tokens[i][0])
        for index, (band, piece) in enumerate(tokens):
            code, name = _split_code(normalize(text(piece)))
            own = [piece]
            if index == target and names:
                y = sum((g.y0 + g.y1) / 2 for g in piece) / len(piece)
                parts = sorted([(y, name, piece)] + [(sum((g.y0 + g.y1) / 2 for g in n) / len(n), normalize(text(n)), n)
                                                     for n in names], key=lambda p: p[0])
                name = ''.join(part[1] for part in parts)
                own = [part[2] for part in parts]
            item = Item(group, piece[0].page, own, code, name, 0, level=band,
                        fixed_anchor=sum((g.y0 + g.y1) / 2 for g in piece) / len(piece))
            item.indent = piece[0].x0
            result.append(item)
    return result


def heading_names(logical: Logical) -> dict[tuple[str, str], str]:
    """Running headings above a table (`款（7）商工費`, `(項) 1 総務管理費`): level and code to name."""
    found = {}
    for line in lines(logical.outside):
        value = normalize(text(line))
        match = re.match(r'^[(（]?(款|項|目)[)）]?[(（]?([0-9]+)[)）]?(.+)$', value)
        if match:
            found[match.group(1), match.group(2)] = match.group(3)
    return found


def owner(amount: list[Glyph], band: Band, ordered: list[Group], found: dict[int, list[Item]]) -> Item | None:
    """The item, in the nearest label group to the left, printed in the amount's row."""
    digits = [g for g in amount if g.text not in ('△', '▲')] or amount
    y = sum((g.y0 + g.y1) / 2 for g in digits) / len(digits)
    top, bottom = _cell(band, y)
    if bottom - top > 80:  # unruled: fall back to the printed line
        top, bottom = y - 4, y + 4
    for group in sorted((g for g in ordered if g.x1 <= band.x0 + 1), key=lambda g: -g.x0):
        candidates = [i for i in found[id(group)] if top - .5 <= i.anchor <= bottom + .5
                      and i.role in ('node', 'repeat', 'total')]
        if candidates:
            return max(candidates, key=lambda i: (i.level or 0, -abs(i.anchor - y)))
    return None


@dataclass
class Built:
    nodes: list[dict]
    amounts: list[dict]
    unowned: list[dict]
    notes: list[dict]


def node_key(item: Item) -> str:
    x0, y0, _, _ = item.glyphs[0].original
    return 'n-' + hashlib.sha256(f'{item.page}:{x0:.2f}:{y0:.2f}:{item.group.axis}'.encode()).hexdigest()[:24]


def build(logicals: list[Logical], judge=None) -> Built:
    """`judge(lines) -> {line id: (role, confidence)}` replaces the codeless-line rules (variant B)."""
    stack: list[Item] = []  # open subject items by depth
    branch: dict[str, list[Item]] = {}  # open items per other axis
    levels: dict[str, list[float]] = {}
    nodes, amounts, unowned, notes = [], [], [], []
    annotations: list[tuple[Item, str, list[Glyph], str | None]] = []
    all_items: list[tuple[Logical, list[Group], dict[int, list[Item]]]] = []
    margins = code_margins(logicals)
    for logical in logicals:
        ordered = groups(logical)
        found = {}
        for group in ordered:
            header = '／'.join(group.bands[0].header) if not group.subject else group.axis
            if not group.subject:
                header = group.axis if group.axis in group.bands[0].header else header
                header = '／'.join(group.bands[0].header[:group.bands[0].header.index(group.axis) + 1]) \
                    if group.axis in group.bands[0].header else header
            roles = None
            if judge is not None and not group.subject:
                roles = judged_roles(judge, group, margins.get(group.axis))
            group_items = subject_items(group) if group.subject else items(group, header, margins.get(group.axis), roles)
            for item in group_items:
                if TRANSFER.search(item.name) and item.code is None and not group.subject:
                    item.role = 'annotation'  # a transfer note annotates the subject row
                elif item.code is None and TOTAL.search(item.name):
                    item.role = 'total'
                elif item.code is None and not item.amounts and not group.subject:
                    item.role = 'note'
            found[id(group)] = group_items
        all_items.append((logical, ordered, found))
    # Indentation levels per non-subject axis, learned over the document.
    indents: dict[str, list[float]] = defaultdict(list)
    for _, ordered, found in all_items:
        for group in ordered:
            if not group.subject:
                indents[group.axis] += [i.indent for i in found[id(group)] if i.role == 'node']
    for axis, values in indents.items():
        clusters: list[list[float]] = []
        for value in sorted(values):
            if clusters and value - clusters[-1][-1] <= 3:
                clusters[-1].append(value)
            else:
                clusters.append([value])
        minimum = max(2, len(values) // 200)
        levels[axis] = [sum(c) / len(c) for c in clusters if len(c) >= minimum]
    depth_of = lambda item: 1 + min(range(len(levels[item.group.axis])),
                                    key=lambda i: abs(levels[item.group.axis][i] - item.indent))
    # Right-aligned amount columns also mark the level: learn which column each
    # indentation level prints its amount in, then read a codeless line whose
    # amount sits in the column of the amountless item above as that item's
    # wrapped last line (`【所管課】 299,161,329`).
    columns: dict[str, dict[int, Counter]] = defaultdict(lambda: defaultdict(Counter))
    for _, ordered, found in all_items:
        for group in ordered:
            if group.subject or not levels.get(group.axis):
                continue
            for item in found[id(group)]:
                if item.role == 'node' and item.amounts:
                    columns[group.axis][round(item.amounts[0][1][-1].x1 - item.amounts[0][1][-1].offset)][depth_of(item)] += 1
    amount_depth = lambda item: next((c.most_common(1)[0][0] for x, c in columns[item.group.axis].items()
                                      if abs(x - round(item.amounts[0][1][-1].x1 - item.amounts[0][1][-1].offset)) <= 2), None)
    for _, ordered, found in all_items:
        for group in ordered:
            if group.subject or not levels.get(group.axis):
                continue
            kept: list[Item] = []
            for item in found[id(group)]:
                previous = kept[-1] if kept else None
                if (previous is not None and previous.role in ('node', 'note') and not previous.amounts
                        and item.role == 'node' and item.code is None and item.amounts and not item.decided
                        and amount_depth(item) == depth_of(previous) and depth_of(item) > depth_of(previous)):
                    previous.role = 'node'
                    previous.lines += item.lines
                    previous.name += item.name
                    previous.amounts += item.amounts
                    continue
                kept.append(item)
            found[id(group)] = kept
    for logical, ordered, found in all_items:
        # A subject item opens at the top of its rule-bounded row: its label may be
        # centred lower than the first remark of its block.
        events = sorted(((subject_row(item, logical)[0] if group.subject else item.anchor,
                          ordered.index(group), item.level or 0, item.anchor, item)
                         for group in ordered for item in found[id(group)]), key=lambda e: e[:4])
        events = [(e[0], e[1], e[4]) for e in events]
        headings = heading_names(logical)
        subject_depth = max((len(g.bands) for g in ordered if g.subject), default=3)
        row = None  # (subject item, top, bottom) of the latest subject row
        for _, _, item in events:
            if not item.group.subject and item.role in ('node', 'note') and row is not None \
                    and (row[0].depth < subject_depth or item.code is None) \
                    and row[1] - .5 <= item.anchor <= row[2] + .5:
                item.role = 'annotation'  # remarks printed on a subject row annotate it
            if item.role == 'annotation':
                target = row[0] if row is not None else (stack[-1] if stack else None)
                notes.append({'kind': 'annotation', 'page': item.page, 'text': item.name,
                              'amounts': [text(r) for _, r in item.amounts]})
                if target is not None:
                    label = normalize(text([g for g in item.glyphs if not any(g in r for _, r in item.amounts)]))
                    for header, run in item.amounts:
                        annotations.append((target, f'{header}／注記／{label}', run, logical.unit))
                continue
            if item.role == 'total':
                notes.append({'kind': 'total', 'page': item.page, 'text': item.name}); continue
            if item.role == 'note':
                notes.append({'kind': 'note', 'page': item.page, 'text': item.name,
                              'amounts': [text(r) for _, r in item.amounts]})
                continue
            if item.group.subject:
                depth = item.level + 1
                previous = stack[depth - 1] if len(stack) >= depth else None
                if previous is not None and previous.code == item.code and (
                        not item.name or normalize(previous.name) == normalize(item.name)):
                    item.key = previous.key  # a repeated subject heading on a continuation page
                    item.role = 'repeat'
                    continue
                if not item.name:
                    level = item.group.bands[item.level].header[-1]
                    item.name = headings.get((level, normalize(item.code or '')), '')
                if depth > len(stack) + 1:
                    unowned.append({'kind': 'subject depth gap', 'page': item.page, 'text': item.name})
                del stack[depth - 1:]
                item.parent = stack[-1] if stack else None
                item.depth = depth
                stack.append(item)
                branch.clear()
                row = (item, *subject_row(item, logical))
            else:
                ranks = levels[item.group.axis]
                depth = 1 + min(range(len(ranks)), key=lambda i: abs(ranks[i] - item.indent)) if ranks else 1
                open_items = branch.setdefault(item.group.axis, [])
                del open_items[depth - 1:]
                while len(open_items) < depth - 1:
                    open_items.append(open_items[-1] if open_items else None)
                parent = next((p for p in reversed(open_items) if p is not None), None)
                item.parent = parent or (stack[-1] if stack else None)
                item.depth = (parent.depth + 1) if parent is not None else 1
                open_items.append(item)
                if item.parent is None:
                    unowned.append({'kind': 'no subject parent', 'page': item.page, 'text': item.name})
            item.key = node_key(item)
            x0, y0, x1, y1 = _bbox(item.glyphs)
            nodes.append({'node_key': item.key, 'parent_node_key': item.parent.key if item.parent else None,
                          'axis_header': item.group.axis, 'depth': item.depth,
                          'level_header': (item.group.bands[item.level].header[-1] if item.group.subject else None),
                          'code_text': item.code, 'name_text': item.name or None, 'physical_page': item.page,
                          'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1})
        for logical_, ordered_, found_ in [(logical, ordered, found)]:
            for item in (i for g in ordered for i in found[id(g)]):
                if item.role not in ('node', 'repeat') or item.key is None:
                    continue
                for header, run in item.amounts:
                    amounts.append(_amount(item.key, header, run, logical.unit))
            for band in logical.bands:
                if band.kind != 'amount':
                    continue
                sign = None
                for line in lines(band.words):
                    money = [g for g in line if is_amount(g.text) or re.fullmatch(r'[0-9,△▲\-]+', g.text)]
                    if [g.text for g in money] in (['△'], ['▲']):
                        sign = money[0]  # a minus sign printed above its number
                        continue
                    if not money:
                        continue
                    if sign is not None and money[0].y0 - sign.y0 < 14 and not money[0].text.startswith(('△', '▲')):
                        money = [sign] + money
                    sign = None
                    candidate = ''.join(g.text for g in money)
                    if not is_amount(candidate):
                        unowned.append({'kind': 'unreadable amount', 'page': money[0].page, 'text': candidate}); continue
                    target = owner(money, band, ordered, found)
                    if target is not None and target.role == 'total':
                        notes.append({'kind': 'total amount', 'page': money[0].page, 'text': candidate})
                        continue
                    if target is None or target.key is None:
                        unowned.append({'kind': 'amount without row', 'page': money[0].page, 'text': candidate,
                                        'header': '／'.join(band.header)})
                        continue
                    amounts.append(_amount(target.key, '／'.join(band.header), money, logical.unit))
    for target, header, run, unit in annotations:
        amounts.append(_amount(target.key, header, run, unit))
    return Built(nodes, _dedupe(amounts, unowned), unowned, notes)


def judged_roles(judge, group: Group, margins: set[int] | None) -> dict[int, str]:
    """Features of each printed line for a judgment: text, indentation and amount column in characters."""
    entries = entries_of(group, margins)
    labelled = [e for e in entries if e[0]]
    if not labelled:
        return {}
    heights = sorted(g.y1 - g.y0 for e in labelled for g in e[0])
    char = heights[len(heights) // 2] or 9
    left = min(e[0][0].x0 for e in labelled)
    right = group.bands[-1].x1
    features = []
    for index, (label, money, code, name) in enumerate(entries):
        if not label:
            continue
        features.append({'id': f'L{index}', 'text': normalize(text(label)), 'code': code,
                         'indent': round((label[0].x0 - left) / char),
                         'amount': normalize(text(money[-1])) if money else None,
                         'amount_inset': round((right - money[-1][-1].x1) / char) if money else None})
    return {int(key[1:]): role for key, (role, _) in judge(features).items()}


def subject_row(item: Item, logical: Logical) -> tuple[float, float]:
    """The narrowest rule-bounded row around a subject label among the amount bands."""
    y = item.anchor
    cells = [_cell(b, y) for b in logical.bands if b.kind == 'amount']
    cells = [c for c in cells if c[1] - c[0] <= 80]
    return min(cells, key=lambda c: c[1] - c[0]) if cells else (y - 4, y + 4)


def _bbox(glyphs: list[Glyph]) -> tuple[float, float, float, float]:
    boxes = [g.original for g in glyphs]
    return (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))


def _amount(key: str, header: str, run: list[Glyph], unit: str | None) -> dict:
    x0, y0, x1, y1 = _bbox(run)
    return {'node_key': key, 'header_path': header, 'amount_text': ''.join(g.text for g in run),
            'unit_text': unit, 'physical_page': run[0].page, 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1}


def _dedupe(amounts: list[dict], unowned: list[dict]) -> list[dict]:
    """A repeated subject heading reprints its amounts; keep one, flag differences."""
    seen: dict[tuple, dict] = {}
    for amount in amounts:
        identity = (amount['node_key'], amount['header_path'])
        if identity in seen:
            if normalize(seen[identity]['amount_text']) != normalize(amount['amount_text']):
                unowned.append({'kind': 'conflicting amount', 'page': amount['physical_page'],
                                'text': f"{seen[identity]['amount_text']} / {amount['amount_text']}",
                                'header': amount['header_path']})
            continue
        seen[identity] = amount
    return list(seen.values())
