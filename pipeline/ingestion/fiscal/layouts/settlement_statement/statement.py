"""Build the printed tree of a 歳入歳出決算事項別明細書 (legal form) from text boxes and rules.

The legal form fixes the columns (科目 / 予算現額 / 節 / 支出済額 / 翌年度繰越額 / 不用額 / 備考),
so one algorithm serves every jurisdiction; only the page geometry differs and it is
read from the page itself:

- Table rules bound the columns. A leaf column's header is the text of every header
  cell above it, matched to the legal-form vocabulary (``headers.json``).
- Stepped rules inside the 科目 column start at the 項 and 目 rows, so the number of
  rules covering a 科目 line is its level.
- 節 lines wrap inside their column; amounts on the right half attach to rows by height.
- 備考 items nest by where their name starts; levels are the modes of the start offsets
  over the document. Budget notes (流用・充用・充当, 不用額) keep their amounts on note
  nodes under the 目, with headers without a phase; they are not spending items.

Inputs are text boxes (an OCR line with its word pieces, or a Poppler word) in
displayed-page points. Nothing is inferred from sums; the tree check validates later.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field, replace
from difflib import SequenceMatcher
import hashlib
import json
import math
from pathlib import Path
import re
import csv
import statistics
import unicodedata

from ingestion.lib.node_tables import NodeTables
from ingestion.lib.ocr_names import AmountDictionary, correct_amount
from ingestion.lib.pdf_rules import PageRules, Rule
from shared.amount import number

HEADERS = json.loads((Path(__file__).with_name('headers.json')).read_text())
TOLERANCE = 3.0
LEVELS = ('款', '項', '目')
SUBJECT_LABELS = ('科目', '款項目', '款項', '目')
# Rule strokes the OCR reads as characters at the edge of a cell.
RULE_ARTIFACTS = '|｜/'
BRACKETS = '()（）'
UNIT = re.compile(r'単位[:：]?(千円|円)')
# A number followed by 款・項・目・節 is a reference ("2款1項9目3節へ"), not the item's own number.
CODE = re.compile(r'^(?P<code>[0-9]+)(?![0-9]|[款項目節][0-9])\s*(?P<name>.*)$')
# 備考 start offsets are smoothed by this width (pt) before taking modes, and a mode holding
# fewer than this share of the lines is no level; measured on the 2025 決算 of 青梅・小金井 (10 volumes).
LEVEL_BANDWIDTH = 1.2
LEVEL_MIN_SHARE = 0.02
# Transfer notes of the budget, printed in 備考 beside the items.
TRANSFER = re.compile(r'流用|充用|充当')
DESTINATION = re.compile(r'[款項目節]へ$')  # "2款1項9目3節へ": where a transfer went
# Annotation kinds come from the shared vocabulary (ADR 0024), longest keyword first.
ANNOTATIONS = sorted(((row['keyword'], row['kind']) for row in csv.DictReader(
    (Path(__file__).resolve().parents[4] / 'shared/fiscal_annotation_map.csv').open())),
    key=lambda item: len(item[0]), reverse=True)
TRANSFER_BLOCK = re.compile(r'[［\[](流用|充用)[］\]]')
# A bracketed heading naming a carry-over kind is a section of the 目, beside its items.
CARRY = re.compile(r'^[(（](前年度|翌年度)?[^)）]*(繰越|継続費)')
ENUMERATOR = re.compile(r'^[(（]?[0-9]+[)）]|^[①-⑳]')
MARKS = '•・○◯〇●。.'


@dataclass(frozen=True)
class Box:
    """One printed text box; ``parts`` are its finer pieces (OCR words) for splitting."""
    id: str
    page: int
    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    parts: tuple['Box', ...] = ()

    @property
    def xc(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def yc(self) -> float:
        return (self.y0 + self.y1) / 2


@dataclass
class Column:
    left: float
    right: float
    kind: str  # subject | name | amount | remarks | blank
    header: str | None = None


@dataclass
class Line:
    boxes: list[Box]
    shift: float = 0.0  # added to y to align a right page with its left page

    @property
    def text(self) -> str:
        """Reading order: printed rows top to bottom (a wrapped name), left to right in a row."""
        rows: list[list[Box]] = []
        for b in sorted(self.boxes, key=lambda b: b.yc):
            if rows and b.yc - rows[-1][0].yc < 0.5 * (b.y1 - b.y0):
                rows[-1].append(b)
            else:
                rows.append([b])
        return ''.join(clean(b.text) for row in rows for b in sorted(row, key=lambda b: b.x0))

    @property
    def x0(self) -> float:
        return min(b.x0 for b in self.boxes)

    @property
    def x1(self) -> float:
        return max(b.x1 for b in self.boxes)

    @property
    def y0(self) -> float:
        return min(b.y0 for b in self.boxes) + self.shift

    @property
    def y1(self) -> float:
        return max(b.y1 for b in self.boxes) + self.shift

    @property
    def yc(self) -> float:
        return (self.y0 + self.y1) / 2


@dataclass
class Table:
    page: int
    top: float
    header_bottom: float
    bottom: float
    columns: list[Column]
    steps: list[Rule]  # stepped 科目 rules, starting below the header
    data: dict[int, list[Box]]  # column index -> boxes
    unit: str | None
    rows: list[Rule] = field(default_factory=list)  # horizontal rules below the header, any length

    def index(self, kind: str) -> list[int]:
        return [i for i, c in enumerate(self.columns) if c.kind == kind]


@dataclass
class Result:
    tables: NodeTables
    notes: list[str] = field(default_factory=list)
    unresolved: list[str] = field(default_factory=list)
    unread: list[str] = field(default_factory=list)
    sources: dict = field(default_factory=dict)


def normalize(text: str) -> str:
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', text))


def clean(text: str) -> str:
    return text.strip().strip(RULE_ARTIFACTS).strip()


def amount_text(boxes: list[Box]) -> str:
    """Printed amount without OCR spacing; an unmatched bracket is layout the OCR half-read."""
    text = re.sub(r'\s+', '', ''.join(clean(b.text) for b in sorted(boxes, key=lambda b: b.x0)))
    text = text.strip(RULE_ARTIFACTS)
    # No amount starts with a Latin letter: a leading A is a misread △.
    text = re.sub(r'^([(（]?)[AＡ](?=[0-9])', r'\1△', text)
    # A closing bracket before the first digit is a rule stroke, not half of a pair.
    text = re.sub(r'^[)）](?=[△▲-]?[0-9])', '', text)
    # Yen amounts have no decimals: periods or 、 grouping digits in threes are misread commas.
    if re.fullmatch(r'[(（]?[△▲-]?[0-9]{1,3}(?:[.,、][0-9]{3})+[)）]?', text):
        text = text.replace('.', ',').replace('、', ',')
    opened, closed = text[:1] in '(（', text[-1:] in ')）'
    if opened != closed:
        text = text[1:] if opened else text[:-1]
    return text


def is_amount(box: Box) -> bool:
    text = amount_text([box])
    return bool(text) and number(text) is not None


def digit_like(text: str) -> bool:
    """Mostly digits: an amount, possibly misread (``861,90g)``), never a name with a count."""
    text = normalize(text)
    digits = sum(c.isdigit() for c in text)
    return digits >= 3 and digits >= 0.6 * len(text)


def only_brackets(box: Box) -> bool:
    text = normalize(box.text)
    return bool(text) and all(c in BRACKETS for c in text)


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, normalize(a), normalize(b)).ratio()


# --- page geometry -------------------------------------------------------------------

@dataclass
class Frame:
    """Outer rules of one table: its width and the horizontal rules spanning it."""
    rules: PageRules
    boxes: list[Box]
    left: float
    right: float
    ys: list[float]
    header_bottom: float | None = None
    table: 'Table | None' = None
    unit: str | None = None

    def same_width(self, other: 'Frame') -> bool:
        return abs(self.left - other.left) <= TOLERANCE and abs(self.right - other.right) <= TOLERANCE


def frames(rules: PageRules, boxes: list[Box]) -> list[Frame]:
    """Outermost groups of horizontal rules sharing a width; nested row rules are dropped."""
    groups: dict[tuple[float, float], list[float]] = defaultdict(list)
    for rule in rules.horizontal:
        if rule.end - rule.start < rules.width * 0.3:
            continue
        key = next((k for k in groups if abs(k[0] - rule.start) <= TOLERANCE and abs(k[1] - rule.end) <= TOLERANCE),
                   (rule.start, rule.end))
        groups[key].append(rule.position)
    found = [Frame(rules, boxes, left, right, sorted(ys)) for (left, right), ys in groups.items() if len(ys) >= 2]
    page_unit = next((m[1] for b in boxes if (m := UNIT.search(normalize(b.text)))), None)
    for frame in found:
        frame.unit = page_unit
    outer = [f for f in found if not any(
        g is not f and g.left <= f.left + TOLERANCE and g.right >= f.right - TOLERANCE
        and g.ys[0] <= f.ys[0] + TOLERANCE and g.ys[-1] >= f.ys[-1] - TOLERANCE for g in found)]
    for frame in outer:
        top, bottom = frame.ys[0], frame.ys[-1]
        amounts = [b for b in boxes if frame.left <= b.xc <= frame.right and top < b.yc < bottom
                   and is_amount(b) and len(normalize(b.text)) > 1]
        if amounts:
            # The centre of the first amount: its box may touch the rule closing the header.
            first = min(b.yc for b in amounts)
            frame.header_bottom = max((y for y in frame.ys if y <= first), default=None)
            if frame.header_bottom in (None, top):
                raise ValueError(f'Header band not found on page {rules.page}')
    return outer


def tables(pages: list[tuple[PageRules, list[Box]]]) -> list[Table]:
    """Tables in page order. A table without amounts (a continuation half) takes the
    header height of a same-width table elsewhere in the document."""
    every = [f for rules, boxes in pages for f in frames(rules, boxes)]
    for frame in every:
        # A page whose only amounts are a bottom total row would put the header there;
        # the same table elsewhere shows where its header really ends.
        heights = [g.header_bottom - g.ys[0] for g in every if g.header_bottom is not None and g.same_width(frame)]
        if frame.header_bottom is not None and heights:
            wanted = frame.ys[0] + min(heights)
            frame.header_bottom = next((y for y in frame.ys if abs(y - wanted) <= TOLERANCE), frame.header_bottom)
    found = []
    for frame in sorted(every, key=lambda f: f.header_bottom is None):
        if frame.header_bottom is None:
            known = [g for g in every if g.header_bottom is not None and g.same_width(frame)]
            if not known:
                continue  # nothing printed that this converter reads
            known = [g for g in known if g.table is not None] or known
            offset = known[0].header_bottom - known[0].ys[0]
            frame.header_bottom = next((y for y in frame.ys if abs(y - frame.ys[0] - offset) <= TOLERANCE), None)
            if frame.header_bottom is None:
                raise ValueError(f'Header band not found on page {frame.rules.page}')
            templates = [g.table.columns for g in known if g.table is not None]
        else:
            templates = None
        inside = [b for b in frame.boxes if frame.left <= b.xc <= frame.right and frame.ys[0] < b.yc < frame.ys[-1]]
        table = build_table(frame.rules, inside, frame.left, frame.right, frame.ys[0], frame.header_bottom,
                            frame.ys[-1], templates)
        table.unit = table.unit or frame.unit
        frame.table = table
        found.append(table)
    return sorted(found, key=lambda t: (t.page, t.columns[0].left))


def build_table(rules: PageRules, boxes: list[Box], left: float, right: float, top: float,
                header_bottom: float, bottom: float, templates: list[list[Column]] | None = None) -> Table:
    verticals = [r for r in rules.vertical if left - TOLERANCE <= r.position <= right + TOLERANCE
                 and r.end >= bottom - TOLERANCE]
    leaves = sorted({round(r.position, 1) for r in verticals if r.start <= header_bottom + TOLERANCE})
    # Level steps inside the 科目 column may stop where a new 款 or 項 begins, so partial rules count.
    segments = [r for r in rules.vertical if left - TOLERANCE <= r.position <= right + TOLERANCE
                and r.start < bottom and r.end > header_bottom]
    if len(leaves) < 3:
        raise ValueError(f'Table columns not found on page {rules.page}')
    header_boxes = split([b for b in boxes if b.yc < header_bottom], leaves)
    cells: dict[tuple[float, float], list[Box]] = defaultdict(list)
    for box in header_boxes:
        bounds = sorted(r.position for r in verticals if r.covers(box.yc, TOLERANCE))
        lo = max((x for x in bounds if x <= box.xc), default=None)
        hi = min((x for x in bounds if x >= box.xc), default=None)
        if lo is not None and hi is not None and lo < hi:
            cells[(lo, hi)].append(box)
    columns = []
    template = None
    if templates is not None:
        # A half without amounts reuses the columns read where the same table printed amounts.
        for candidate in templates:
            # Continuation pages may print the 款・項・目 code rules from the top of the 科目 column.
            inner = [x for x in leaves if not any(c.kind == 'subject' and c.left + TOLERANCE < x < c.right - TOLERANCE
                                                  for c in candidate)]
            if len(candidate) == len(inner) - 1 and all(abs(c.left - lo) <= TOLERANCE for c, lo in zip(candidate, inner)):
                template, leaves = candidate, inner
                break
        if template is None:
            raise ValueError(f'Columns on page {rules.page} match no table that printed amounts')
        columns = [Column(lo, hi, c.kind, c.header) for c, lo, hi in zip(template, leaves, leaves[1:])]
    for lo, hi in zip(leaves, leaves[1:]) if template is None else ():
        own = cells.get((lo, hi), [])
        above = sorted(((span, bs) for span, bs in cells.items() if span != (lo, hi)
                        and span[0] <= lo + TOLERANCE and span[1] >= hi - TOLERANCE),
                       key=lambda item: min(b.y0 for b in item[1]))
        columns.append(classify(lo, hi, reading(own), [reading(bs) for _, bs in above], rules.page))
    resolve_unread(columns, rules.page)
    # The 科目 column spans everything left of the first amount column: its 款・項 code
    # columns may carry no header text of their own.
    first = next((i for i, c in enumerate(columns) if c.kind in ('amount', 'name', 'remarks')), len(columns))
    if any(c.kind == 'subject' for c in columns[:first]):
        columns[:first] = [replace(c, kind='subject') for c in columns[:first]]
    merged_columns: list[Column] = []
    for column in columns:
        if merged_columns and column.kind == 'subject' and merged_columns[-1].kind == 'subject':
            # Code columns of 款・項・目 printed from the top: one 科目 column, its inner rules are steps.
            merged_columns[-1] = Column(merged_columns[-1].left, column.right, 'subject')
        else:
            merged_columns.append(column)
    columns = merged_columns
    leaves = [c.left for c in columns] + [columns[-1].right]
    steps = [r for r in segments for c in columns
             if c.kind == 'subject' and c.left + TOLERANCE < r.position < c.right - TOLERANCE]
    data_boxes = [b for b in boxes if b.yc > header_bottom]
    unit = None
    kept = []
    for box in data_boxes:
        if normalize(box.text) == '円':
            unit = '円'  # a unit row printed under the header
        else:
            kept.append(box)
    data: dict[int, list[Box]] = defaultdict(list)
    for box in split(kept, leaves):
        index = next((i for i, c in enumerate(columns) if c.left <= box.xc <= c.right), None)
        if index is not None:
            data[index].append(box)
    rows = [r for r in rules.horizontal if header_bottom + TOLERANCE < r.position < bottom - TOLERANCE
            and r.end > left and r.start < right]
    return Table(rules.page, top, header_bottom, bottom, columns, steps, data, unit, rows)


def split(boxes: list[Box], bounds: list[float]) -> list[Box]:
    """Replace a box that crosses a column rule by one box per column it covers.

    The pieces landing in one column are one printed cell: OCR splits ``1,649,402,000``
    into word pieces at its commas, and each piece alone is not an amount.
    """
    result = []
    for box in boxes:
        crosses = any(box.x0 + TOLERANCE < x < box.x1 - TOLERANCE for x in bounds)
        if not (crosses and box.parts):
            result.append(box)
            continue
        cells: list[tuple[int, list[Box]]] = []
        for part in sorted(box.parts, key=lambda p: p.x0):
            cell = sum(1 for x in bounds if x <= part.xc)
            if cells and cells[-1][0] == cell:
                cells[-1][1].append(part)
            else:
                cells.append((cell, [part]))
        result.extend(parts[0] if len(parts) == 1 else joined(parts) for _, parts in cells)
    return result


def joined(parts: list[Box]) -> Box:
    """Word pieces of one cell as one box; the comma OCR dropped between digit groups returns."""
    text = parts[0].text
    for part in parts[1:]:
        text += (',' if re.search(r'[0-9]$', text) and re.match(r'[0-9]{3}', part.text) else ' ') + part.text
    return Box(parts[0].id, parts[0].page, text, min(p.x0 for p in parts), min(p.y0 for p in parts),
               max(p.x1 for p in parts), max(p.y1 for p in parts), tuple(parts))


def reading(boxes: list[Box]) -> str:
    """Text of one header cell in reading order: lines top to bottom, left to right."""
    lines = group_lines(boxes)
    return ''.join(normalize(line.text) for line in lines)


def classify(left: float, right: float, own: str, above: list[str], page: int) -> Column:
    if not own and not above:
        return Column(left, right, 'blank')
    text = normalize(own or above[-1])
    if any(c in text for c in ('款', '項', '科')) or max(similarity(text, label) for label in SUBJECT_LABELS) >= 0.6:
        return Column(left, right, 'subject')
    if not own:
        # Only the spanning header was read (e.g. a one-character 計); the form's order decides later.
        return Column(left, right, 'unread', '／'.join(above))
    text = own
    parents = above
    best = None
    for entry in HEADERS['columns']:
        score = max(similarity(text, label) for label in entry['labels'])
        if entry.get('parent'):
            # Any header cell above may be the parent: 節 itself sits under 予算現額 in the form.
            if not any(similarity(cell, label) >= 0.6 for cell in parents for label in entry['parent_labels']):
                continue
        elif parents:
            continue
        if best is None or score > best[0]:
            best = (score, entry)
    if best is None or best[0] < 0.6:
        raise ValueError(f'Unknown legal-form column on page {page}: {"／".join([*parents, text])}')
    entry = best[1]
    return Column(left, right, entry['kind'], entry.get('header'))


def resolve_unread(columns: list[Column], page: int) -> None:
    """Name columns whose own header was not read from the legal-form order of their neighbours.

    ``headers.json`` lists the columns in the form's order. A run of unread columns between
    two read ones takes, in order, the form's columns between them that share the read
    spanning header, but only when there are exactly as many of them as unread columns.
    """
    order = [entry['header'] for entry in HEADERS['columns']]
    index = 0
    while index < len(columns):
        if columns[index].kind != 'unread':
            index += 1
            continue
        end = index
        while end < len(columns) and columns[end].kind == 'unread':
            end += 1
        before = next((order.index(c.header) for c in reversed(columns[:index]) if c.header in order), -1)
        after = next((order.index(c.header) for c in columns[end:] if c.header in order), len(order))
        parents = {cell for c in columns[index:end] for cell in c.header.split('／')}
        candidates = [entry for entry in HEADERS['columns'][before + 1:after]
                      if entry.get('parent') and any(similarity(cell, label) >= 0.6
                                                     for cell in parents for label in entry['parent_labels'])]
        if len(candidates) != end - index:
            raise ValueError(f'Unknown legal-form column on page {page}: {columns[index].header}')
        for offset, entry in enumerate(candidates):
            column = columns[index + offset]
            columns[index + offset] = Column(column.left, column.right, entry['kind'], entry['header'])
        index = end


def group_lines(boxes: list[Box], shift: float = 0.0) -> list[Line]:
    lines: list[Line] = []
    for box in sorted(boxes, key=lambda b: (b.y0, b.x0)):
        for line in reversed(lines[-3:]):
            overlap = min(line.y1 - shift, box.y1) - max(line.y0 - shift, box.y0)
            if overlap >= 0.4 * min(box.y1 - box.y0, line.y1 - line.y0):
                line.boxes.append(box)
                break
        else:
            lines.append(Line([box], shift))
    return sorted(lines, key=lambda line: (line.y0, line.x0))


# --- tree ----------------------------------------------------------------------------

@dataclass(eq=False)
class Node:
    key: str
    parent: str | None
    axis: str
    depth: int
    level: str | None
    code: str | None
    name: str
    page: int
    box: tuple[float, float, float, float]
    amounts: dict[str, tuple[str, Box]] = field(default_factory=dict)


class Builder:
    def __init__(self, table_id: str, corrections: AmountDictionary | None = None):
        self.table_id = table_id
        self.corrections = corrections
        self.used: set[str] = set()
        self.nodes: list[Node] = []
        self.by_identity: dict[tuple, Node] = {}
        self.ordinals: dict[tuple, int] = defaultdict(int)
        self.context: list[Node | None] = [None, None, None]
        self.remarks: dict[str, list[tuple[int, Node]]] = defaultdict(list)
        self.wrapping: set[Node] = set()
        self.transfer_blocks: dict[str, str] = {}  # 目 whose 備考 continues as a ［流用］ block, and its word
        self.name_limit = 0.0  # right end of the 備考 name area, relative to the column
        self.unresolved_lines: list[str] = []
        self.unread_items: list[str] = []
        self.issues: list[str] = []
        # OCR boxes behind each amount (before corrections), for re-reading a failing cell.
        self.sources: dict[tuple[str, str], list[Box]] = {}

    def node(self, parent: Node | None, axis: str, depth: int, level: str | None, code: str | None,
             name: str, line: Line, page: int, *, reuse: bool) -> Node:
        identity = (parent.key if parent else None, axis, level, code, name)
        if reuse and identity in self.by_identity:
            return self.by_identity[identity]
        ordinal = self.ordinals[identity]
        self.ordinals[identity] += 1
        key = 'n-' + hashlib.sha256(json.dumps([self.table_id, *identity, ordinal], ensure_ascii=False)
                                     .encode()).hexdigest()[:24]
        box = (line.x0, min(b.y0 for b in line.boxes), line.x1, max(b.y1 for b in line.boxes))
        created = Node(key, parent.key if parent else None, axis, depth, level, code, name, page, box)
        self.nodes.append(created)
        self.by_identity[identity] = created
        return created

    def amount(self, node: Node, header: str, boxes: list[Box]) -> None:
        observed = boxes
        boxes = [self.corrected(b) for b in boxes]
        text = amount_text(boxes)
        if not text:
            return
        if number(text) is None:
            if not any(c.isdigit() for c in text):
                return  # a speck read as a mark (•, 。); a printed dash already reads as 0
            self.unread_items.append(f'p{boxes[0].page} {node.name}／{header}: {text}')
            self.sources.setdefault((node.key, header), observed)
            return
        self.sources.setdefault((node.key, header), observed)
        if header in node.amounts and number(node.amounts[header][0]) != number(text):
            self.issues.append(f'反復した金額が一致しない: {node.name}／{header}')
            return
        node.amounts.setdefault(header, (text, boxes[0] if len(boxes) == 1 else merged(boxes)))

    def note(self, target: Node, kind: str, name: str, line: Line, page: int, boxes: list[Box]) -> None:
        """A monetary annotation keeps its printed text and amount on its own 注記 node under the 目
        (ADR 0024). One 目 can print several transfers; a node per note keeps them apart.
        Its header has no phase, so the tree check and the executed amount leave it out.
        """
        node = self.node(target, '注記', 1, kind, None, name, line, page, reuse=False)
        self.amount(node, '注記金額', boxes)

    def corrected(self, box: Box) -> Box:
        """Apply a declared amount correction to one OCR box; the observation itself stays."""
        if self.corrections is None:
            return box
        result = correct_amount(box.text, page=box.page, observation_id=box.id, dictionary=self.corrections)
        if result['rule_id'] is None:
            return box
        self.used.add(result['rule_id'])
        return replace(box, text=result['corrected_amount'])

    def tables(self, unit: str) -> NodeTables:
        nodes, amounts = [], []
        for n in self.nodes:
            nodes.append({'node_key': n.key, 'parent_node_key': n.parent, 'axis_header': n.axis,
                          'depth': n.depth, 'level_header': n.level, 'code_text': n.code, 'name_text': n.name,
                          'physical_page': n.page, 'x0': n.box[0], 'y0': n.box[1], 'x1': n.box[2], 'y1': n.box[3]})
            for header, (text, box) in n.amounts.items():
                amounts.append({'node_key': n.key, 'header_path': header, 'amount_text': text, 'unit_text': unit,
                                'physical_page': box.page, 'x0': box.x0, 'y0': box.y0, 'x1': box.x1, 'y1': box.y1})
        return NodeTables(nodes, amounts, len(self.unread_items), len(self.unresolved_lines), self.issues)

    def unresolved(self, reason: str, page: int, text: str) -> None:
        self.unresolved_lines.append(f'p{page} {reason}: {text}')


def merged(boxes: list[Box]) -> Box:
    return Box(boxes[0].id, boxes[0].page, ''.join(b.text for b in boxes), min(b.x0 for b in boxes),
               min(b.y0 for b in boxes), max(b.x1 for b in boxes), max(b.y1 for b in boxes))


def spreads(found: list[Table]) -> list[tuple[Table, Table]]:
    """Pair each half carrying 科目 with the next half carrying 備考 (same or next page)."""
    pairs, pending = [], None
    for table in found:
        has_subject, has_remarks = bool(table.index('subject')), bool(table.index('remarks'))
        if has_subject and has_remarks:
            pairs.append((table, table))
            pending = None
        elif has_subject:
            pending = table
        elif has_remarks:
            if pending is None:
                raise ValueError(f'Right half on page {table.page} has no left half')
            pairs.append((pending, table))
            pending = None
    if pending is not None:
        raise ValueError(f'Left half on page {pending.page} has no right half')
    return pairs


def build(table_id: str, pages: list[tuple[PageRules, list[Box]]],
          corrections: AmountDictionary | None = None) -> Result:
    found = tables(pages)
    pairs = spreads(found)
    remark_lines = []
    for left, right in pairs:
        shift = left.header_bottom - right.header_bottom
        for index in right.index('remarks'):
            column = right.columns[index]
            for line in group_lines(right.data.get(index, []), shift):
                remark_lines.append((column, line))
    levels, hanging = remark_levels(remark_lines)
    builder = Builder(table_id, corrections)
    builder.name_limit = max((name_part(line, column)[2] - column.left for column, line in remark_lines
                              if name_part(line, column)[0]), default=0.0)
    units = {t.unit for t in found if t.unit}
    for left, right in pairs:
        spread(builder, left, right, levels, hanging)
    unused = {r.id for r in corrections.rules} - builder.used if corrections else set()
    if unused:
        raise ValueError(f'Amount corrections matched no amount: {sorted(unused)}')
    if len(units) > 1:
        raise ValueError(f'Several units in one table: {sorted(units)}')
    if not units:
        raise ValueError('No printed unit found')
    return Result(builder.tables(units.pop()), unresolved=builder.unresolved_lines, unread=builder.unread_items,
                  sources=builder.sources)


def remark_levels(lines: list[tuple[Column, Line]]) -> tuple[list[float], list[float]]:
    """Start offsets of 備考 names as the modes of their smoothed distribution over the document.

    Chaining nearby offsets would join two levels through a few lines in between, so each
    line goes to its nearest mode, a mode holding too few lines is dropped, and a level sits
    at the median of its lines. A cluster whose lines never carry a number and always follow
    a line without an amount is a hanging indent of wrapped names, not a level.
    """
    starts = []
    previous_amount = True
    for column, line in lines:
        text, x0, _, amounts = name_part(line, column)
        if text:
            starts.append((x0 - column.left, parse_code(text)[0] is not None, previous_amount))
        previous_amount = bool(amounts)
    if not starts:
        return [], []
    xs = [x for x, _, _ in starts]
    grid = [min(xs) - 5 + 0.25 * i for i in range(int((max(xs) - min(xs) + 10) / 0.25) + 1)]
    density = [sum(math.exp(-0.5 * ((g - x) / LEVEL_BANDWIDTH) ** 2) for x in xs) for g in grid]
    modes = [grid[i] for i in range(1, len(grid) - 1) if density[i - 1] <= density[i] > density[i + 1]] or [xs[0]]
    while True:
        clusters: dict[float, list[tuple[float, bool, bool]]] = {m: [] for m in modes}
        for item in starts:
            clusters[min(modes, key=lambda m: abs(m - item[0]))].append(item)
        sparse = [m for m in modes if len(clusters[m]) < LEVEL_MIN_SHARE * len(starts)]
        if not sparse or len(sparse) == len(modes):
            break
        modes = [m for m in modes if m not in sparse]
    levels, hanging = [], []
    for mode in sorted(modes):
        cluster = clusters[mode]
        if not cluster:
            continue
        wrapped = all(not coded and not after_amount for _, coded, after_amount in cluster)
        (hanging if wrapped and levels else levels).append(statistics.median(x for x, _, _ in cluster))
    return levels, hanging


def name_part(line: Line, column: Column) -> tuple[str, float, float, list[Box]]:
    """Name text, its left/right edge and the amount boxes of one 備考 line."""
    names, amounts = [], []
    right_side = column.left + 0.6 * (column.right - column.left)
    for box in sorted(line.boxes, key=lambda b: b.x0):
        if only_brackets(box):
            continue
        if is_amount(box) and box.x1 > right_side:
            amounts.append(box)
            continue
        # OCR can read a name and its amount as one line: peel digit pieces off its right end.
        parts = sorted(box.parts, key=lambda b: b.x0)
        tail = []
        while parts and parts[-1].x1 > right_side and digit_like(parts[-1].text):
            tail.insert(0, parts.pop())
        if tail and parts:
            names.append(merged(parts))
            amounts.extend(tail)
        else:
            names.append(box)
    text = ''.join(clean(b.text) for b in names)
    if not names:
        return '', 0.0, 0.0, amounts
    return text, min(b.x0 for b in names), max(b.x1 for b in names), amounts


def level_of(x: float, levels: list[float]) -> int:
    return min(range(len(levels)), key=lambda i: abs(levels[i] - x)) + 1


def spread(builder: Builder, left: Table, right: Table, levels: list[float], hanging: list[float]) -> None:
    shift = left.header_bottom - right.header_bottom
    events = []  # (sort key, kind, payload)
    subject = left.index('subject')[0]
    for block in subject_blocks(group_lines(left.data.get(subject, [])), left.rows):
        events.append((block.y0, 0, 'subject', block))
    for index in left.index('name'):
        for block in setsu_blocks(group_lines(left.data.get(index, []))):
            events.append((block.y0, 1, 'setsu', block))
    # A 備考 line sorts by its bottom, yet never past the rule that opens the next 科目 row:
    # a line reaching over that rule still belongs to the row above.
    subject_column = left.columns[subject]
    row_tops = sorted(r.position for r in left.rows if r.start < subject_column.right and r.end > subject_column.left)
    for index in right.index('remarks'):
        column = right.columns[index]
        for line in group_lines(right.data.get(index, []), shift):
            below = next((y for y in row_tops if y > line.yc), None)
            events.append((line.y1 if below is None else min(line.y1, below - TOLERANCE), 2, 'remark', (column, line)))
    anchors: list[tuple[Line, Node]] = []
    for _, _, kind, payload in sorted(events, key=lambda e: (e[0], e[1])):
        if kind == 'subject':
            subject_line(builder, left, payload, anchors)
        elif kind == 'setsu':
            target = builder.context[2]
            if target is None:
                builder.unresolved('目のない節', left.page, payload.text)
                continue
            code, name = parse_code(setsu_text(payload.text))
            node = builder.node(target, '節', 1, None, code, name, payload, left.page, reuse=False)
            anchors.append((payload, node))
        else:
            remark_line(builder, *payload, levels, hanging, right.page)
    # Amounts attach by height to the rows of this spread; the right half is shifted onto the left.
    for table, offset in {id(left): (left, 0.0), id(right): (right, shift)}.values():
        for index, column in enumerate(table.columns):
            if column.kind == 'amount':
                for box in table.data.get(index, []):
                    attach(builder, anchors, column, box, offset)


def attach(builder: Builder, anchors: list[tuple[Line, Node]], column: Column, box: Box, offset: float) -> None:
    y = box.yc + offset
    matches = [(abs(line.yc - y), node) for line, node in anchors
               if line.y0 - TOLERANCE <= y <= line.y1 + TOLERANCE]
    if not matches:
        if normalize(box.text):
            builder.unresolved(f'行のない金額（{column.header}）', box.page, box.text)
        return
    node = min(matches, key=lambda m: m[0])[1]
    if node is not None:
        builder.amount(node, column.header, [box])


def parse_code(text: str) -> tuple[str | None, str]:
    match = CODE.match(normalize(text))
    if match is None:
        return None, normalize(text)
    return match['code'], match['name']


def subject_line(builder: Builder, table: Table, line: Line, anchors: list) -> None:
    text = normalize(line.text)
    # 款・項・目 rows print their 予算現額; a row without them repeats the heading on a continuation
    # page. The 節 columns are left out: the first 節 of a continuation page shares the heading's height.
    printed = any(line.y0 - TOLERANCE <= box.yc <= line.y1 + TOLERANCE
                  for index, column in enumerate(table.columns)
                  if column.kind == 'amount' and column.header.startswith('予算現額')
                  for box in table.data.get(index, []) if normalize(box.text))
    if not printed:
        return
    code, name = subject_code(line, table.steps)
    if code is None and (text == '計' or text.endswith('合計')):
        anchors.append((line, None))  # 歳出合計: a control row whose amounts are not items of the tree
        return
    # A printed row without a number keeps its name: OCR drops single digits in the narrow code columns.
    # Text sits just right of its level rule, so the rule positions decide the level even where a
    # short rule was not detected; OCR boxes may start a little left of the first character.
    positions = sorted({round(r.position) for r in table.steps})
    depth = 1 + sum(1 for x in positions if x <= code_start(line, table.steps) + TOLERANCE)
    if depth > 3:
        builder.issues.append(f'科目の段が深すぎる: {text}')
        return
    if code is None:
        # Without its number the name's edge can sit right of its own level rule:
        # place it at the deepest level that has a parent.
        while depth > 1 and builder.context[depth - 2] is None:
            depth -= 1
    parent = builder.context[depth - 2] if depth > 1 else None
    if depth > 1 and parent is None:
        builder.unresolved('親のない科目', table.page, text)
        return
    node = builder.node(parent, '科目', depth, LEVELS[depth - 1], code, name, line, table.page, reuse=True)
    builder.context[depth - 1] = node
    for i in range(depth, 3):
        builder.context[i] = None
    anchors.append((line, node))


def pieces(line: Line) -> list[Box]:
    return sorted((p for b in line.boxes for p in (b.parts or (b,))), key=lambda p: (p.y0 > line.boxes[0].y1, p.x0))


def leading_codes(line: Line, steps: list[Rule] = ()) -> list[tuple[float, str]]:
    """Leading numbers of a 科目 line with their left edges.

    Codes of 款・項・目 sit in code columns split by the stepped rules; OCR can read two of
    them as one number (``1 2`` as ``12``). A number spanning a step rule is cut there, its
    digits shared by width, so each code keeps its own column.
    """
    codes = []
    for piece in pieces(line):
        text = normalize(piece.text).strip('()（）')
        digits = re.match(r'[0-9]+', text)
        if digits is None:
            break
        inside = sorted(r.position for r in steps if piece.x0 + TOLERANCE < r.position < piece.x1 - TOLERANCE)
        if inside and len(digits[0]) > 1:
            cut = round((inside[-1] - piece.x0) / (piece.x1 - piece.x0) * len(text))
            cut = min(max(cut, 1), len(digits[0]) - 1)
            codes += [(piece.x0, digits[0][:cut]), (inside[-1], digits[0][cut:])]
        else:
            codes.append((piece.x0, digits[0]))
        if digits[0] != text:
            break
    return codes


def code_start(line: Line, steps: list[Rule] = ()) -> float:
    """Left edge of the code printed right before the name; a page-top 目 prints its whole code path."""
    codes = leading_codes(line, steps)
    return codes[-1][0] if codes else line.x0


def subject_code(line: Line, steps: list[Rule] = ()) -> tuple[str | None, str]:
    """The last of the leading numbers is the item's code (``13 1 7 名称`` is 目 7)."""
    text = unicodedata.normalize('NFKC', line.text).strip()
    match = re.match(r'^((?:[0-9]+[\s()（）]*)+)(.*)$', text)
    if match is None:
        return None, normalize(text)
    codes = leading_codes(line, steps)
    return codes[-1][1] if codes else re.findall(r'[0-9]+', match[1])[-1], normalize(match[2])


def subject_blocks(lines: list[Line], rows: list[Rule] = ()) -> list[Line]:
    """A 款・項・目 name wraps onto lines without a number right below it (closer than half a line).

    A row rule between two lines closes the row above, so a line whose number OCR dropped
    still starts its own row.
    """
    blocks: list[Line] = []
    for line in lines:
        previous = blocks[-1] if blocks else None
        wraps = (previous is not None and not CODE.match(normalize(line.text))
                 and line.y0 - previous.y1 < 0.5 * (line.y1 - line.y0)
                 and not any(r.start < line.x1 and r.end > line.x0 and previous.y1 - 1 <= r.position <= line.y0 + 1
                             for r in rows))
        if wraps:
            previous.boxes.extend(line.boxes)
        else:
            blocks.append(Line(list(line.boxes), line.shift))
    return blocks


def setsu_text(text: str) -> str:
    """節 text whose leading 1 OCR read as a letter or a rule (``I1役務費``) gets its digit back."""
    return re.sub(r'^[IlL|｜]([0-9])', r'1\1', normalize(text))


def setsu_blocks(lines: list[Line]) -> list[Line]:
    """A 節 starts at a line with its number; lines without one continue the name."""
    blocks: list[Line] = []
    for line in lines:
        if CODE.match(setsu_text(line.text)) or not blocks:
            blocks.append(Line(list(line.boxes), line.shift))
        else:
            blocks[-1].boxes.extend(line.boxes)
    return blocks


def unclosed(name: str) -> bool:
    return name.count('(') + name.count('（') > name.count(')') + name.count('）')


def annotation_kind(name: str, block: str | None) -> str:
    """The shared kind of a note; a line inside a ［流用］ block, or a bare transfer word, takes that word."""
    compact = normalize(name)
    for keyword, kind in ANNOTATIONS:
        if keyword in compact:
            return kind
    transfer = block or (match.group(0) if (match := TRANSFER.search(compact)) else None)
    if transfer is None:
        return '不用額'
    return '流用' if transfer == '流用' else '充用'


def remark_note(builder: Builder, target: Node, name: str, line: Line, amounts: list[Box], page: int) -> bool:
    """Budget notes in 備考 are no spending items: a transfer (流用・充用・充当, or every line
    of a ［流用］ block) or the 不用額 of the 目. They become 注記 nodes under the 目 (ADR 0024)."""
    if block := TRANSFER_BLOCK.fullmatch(name):
        builder.transfer_blocks[target.key] = block.group(1)
        return True
    if target.key in builder.transfer_blocks or TRANSFER.search(name) or name.lstrip(MARKS) == '不用額':
        kind = annotation_kind(name, builder.transfer_blocks.get(target.key))
    elif DESTINATION.search(name):
        kind = '充用' if normalize(target.name) == '予備費' else '流用'
    else:
        return False
    if amounts:
        builder.note(target, kind, name or normalize(line.text), line, page, amounts)
    return True


def remark_line(builder: Builder, column: Column, line: Line, levels: list[float], hanging: list[float],
                page: int) -> None:
    target = builder.context[2]
    if target is None:
        builder.unresolved('目のない備考', page, line.text)
        return
    stack = builder.remarks[target.key]
    text, x0, x1, amounts = name_part(line, column)
    if remark_note(builder, target, normalize(text), line, amounts, page):
        return
    if not text:
        # An amount wrapped onto its own line belongs to the item above without one.
        if stack and amounts and '備考' not in stack[-1][1].amounts:
            builder.amount(stack[-1][1], '備考', amounts)
            builder.wrapping.discard(stack[-1][1])
        elif amounts:
            builder.unresolved('名前のない備考の金額', page, line.text)
        return
    if normalize(text) == '計':
        if amounts and '支出済額' in target.amounts and number(amount_text(amounts)) != number(target.amounts['支出済額'][0]):
            builder.issues.append(f'備考の計が目の支出済額と一致しない: {target.name}')
        return
    offset = x0 - column.left
    indented = bool(hanging) and min(abs(h - offset) for h in hanging) < min(abs(l - offset) for l in levels)
    depth = level_of(offset, levels)
    previous = stack[-1] if stack else None
    name = normalize(text)
    open_item = previous is not None and '備考' not in previous[1].amounts
    unnumbered = parse_code(text)[0] is None and not ENUMERATOR.match(name)
    # A same-depth line after an item without amount continues its name: a leaf without an amount
    # or children would be empty. A numbered line always starts a new item.
    continues = (open_item and previous[0] == depth
                 and (previous[1] in builder.wrapping or parse_code(text)[0] is None))
    # An amount OCR read into the name (``職員手当等50917,080)``) was printed: that item is complete.
    open_item = open_item and not re.search(r'[0-9][,，.][0-9]|[0-9][)）]$', previous[1].name)
    # An unnumbered line, as deep or deeper, that completes an item without amount (it carries the
    # amount or closes the item's bracket) is the rest of that name, wherever its wrap is indented.
    continues = continues or (open_item and unnumbered and depth >= previous[0]
                              and (bool(amounts) or unclosed(previous[1].name)))
    # A name cut after a separator (``3・4・``) goes on, even when its next line starts with a digit.
    continues = continues or (open_item and previous[1].name.endswith(('•', '・', '･', '·')))
    if CARRY.match(name):
        depth, indented, continues = 1, False, False
    if previous is not None and (indented or continues):
        # The name above reached the end of the name area without an amount: it wraps here.
        node = previous[1]
        node.name += normalize(text)
        node.box = (node.box[0], node.box[1], max(node.box[2], x1), max(b.y1 for b in line.boxes))
    else:
        while stack and stack[-1][0] >= depth:
            stack.pop()
        parent = stack[-1][1] if stack else target
        code, name = parse_code(text)
        node = builder.node(parent, '備考', depth, None, code, name, line, page, reuse=False)
        stack.append((depth, node))
    builder.wrapping.discard(node)
    if amounts:
        builder.amount(node, '備考', amounts)
    elif x1 - column.left >= builder.name_limit - 6:
        builder.wrapping.add(node)
