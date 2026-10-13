"""The generic node builder as a converter: one selected text PDF's account scope to node and amount tables.

`convert(inputs, destination, options)` is the contract of every converter in
`ingestion/fiscal/layouts/`; the entry `fiscal/layouts/generic_text/convert.py` re-exports it. The declarations
are the account and the table ID (and `partial` for one volume of an account printed in several). The pages
are the selection's own scope of that account and direction, so nothing about a coordinate, a column or a
level name is written down.

The builder already produces node and amount tables, so the result is handed to `run.py` as a
`{'nodes': path, 'amounts': path}` descriptor (no wide table, no migration). Beside it the converter writes
the digit-coverage scope (`<table_id>.coverage.json`, `node_tables.coverage_sidecar`).

Money printed as a note (流用・充用・不用額・繰越明許費…) is laid on the 注記 axis the way ADR 0024 keeps it:
a node of kind (the shared dictionary's value) under the account it annotates, the note's own words as its
name, and an amount under the heading 注記金額. The builder keeps such amounts off the account itself, so a
note never adds to a sum. A note whose words give no kind stays unadopted, and its digits stop the coverage
check rather than becoming an amount of something.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re

from ingestion.generic.build import run_pages
from ingestion.generic.layout import normalize
from ingestion.generic.notes import kind_of
from ingestion.lib.node_tables import AMOUNT_COLUMNS, NODE_COLUMNS, coverage_regions, write_coverage_words
from ingestion.lib.parquet import write_parquet
from ingestion.paths import CACHE

NOTE_SEPARATOR = '／注記／'
# An account code joined by hyphens (`02-01-02-15-11-01`): printed text in a transfer note's label, and
# amount-shaped to the coverage check, which never lets a hyphen-and-digits word be a label.
ACCOUNT_CODE = re.compile(r'[0-9０-９][-－―—][0-9０-９]')
TOTAL_ROW = re.compile(r'(?:合計|総計)$')
FOOTNOTE_MARK = re.compile(r'[※＊*][0-9]+')
ITEM_NUMBER = re.compile(r'^([0-9０-９]{1,4})[.．]$')
RATIO_HEADER = re.compile(r'割合|比率|構成比|率$')


def scope_pages(source: dict, account: str) -> list[int]:
    """The physical pages the selection declares for the account (and the manifest's direction)."""
    scopes = [scope for scope in source['scope'] if scope['account'] == account]
    if len(scopes) != 1:
        raise ValueError(f'The selected original needs exactly one scope for {account}')
    return [page for first, last in scopes[0]['pages'] for page in range(first, last + 1)]


def printed(glyphs: list) -> str:
    """The words as printed: a space where two words on a line are apart (`annotations.py` keeps a heading so)."""
    parts, previous = [], None
    for glyph in sorted(glyphs, key=lambda g: (g.page, round(g.y0), g.x0)):
        if previous is not None and glyph.page == previous.page and abs(glyph.y0 - previous.y0) <= 2 \
                and glyph.x0 - previous.x1 > 2:
            parts.append(' ')
        parts.append(glyph.text)
        previous = glyph
    return ''.join(parts)


def union(glyphs: list) -> tuple[float, float, float, float]:
    boxes = [g.original for g in glyphs]
    return (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))


def lay_notes(built) -> tuple[list[dict], list[dict], list[dict], set, list]:
    """The 注記 axis of a built table: nodes and their amounts (heading 注記金額), and the printed notes
    that no kind could be given (left unadopted: their digits stay in front of the coverage check).

    A note is a remark on an account's own line, or an amount kind printed inside an item whose label is a
    word of the shared annotation dictionary. A column whose printed heading ends in such a word
    (歳出総括／翌年度繰越額／繰越明許費) is a column of the table and never reaches here.
    Both leave the node's own amounts: a note is not part of any sum (ADR 0024).
    """
    nodes, amounts, unresolved, dropped = [], [], [], set()
    codes = []  # words of a note's label that print a joined account code
    seen = set()
    for record in built.annotations:
        label = printed(record['label'])
        # The dictionary first; then what the account says (a reserve's remarks are 充用); then the
        # transfer words of a remark.
        kind = kind_of(label) or record.get('hint') or kind_of(label, words=record['kind'] == 'annotation')
        if kind is None:
            if record['kind'] == 'annotation' and record['runs']:
                where = record['runs'][0][0] if record['runs'] else (record['label'][0] if record['label'] else None)
                unresolved.append({'label': label, 'amounts': [''.join(g.text for g in run) for run in record['runs']],
                                   'page': where.page if where else None, 'y': round(where.y0) if where else None})
            continue
        if record['kind'] == 'kind line':
            dropped.add((record['node_key'], record['heading']))
        codes += [g for g in record['label'] if ACCOUNT_CODE.search(g.text)]
        for run in record['runs']:
            x0, y0, x1, y1 = union(run)
            page = run[0].page
            ident = (record['parent_node_key'], page, round(x0, 1), round(y0, 1), round(x1, 1), round(y1, 1), label)
            if ident in seen:
                continue
            seen.add(ident)
            key = 'a-' + hashlib.sha256(json.dumps(ident, ensure_ascii=False).encode()).hexdigest()[:24]
            lx0, ly0, lx1, ly1 = union(record['label']) if record['label'] else (x0, y0, x1, y1)
            nodes.append({'node_key': key, 'parent_node_key': record['parent_node_key'], 'axis_header': '注記',
                          'depth': 1, 'level_header': kind, 'code_text': None, 'name_text': label or None,
                          'physical_page': record['label'][0].page if record['label'] else page,
                          'x0': lx0, 'y0': ly0, 'x1': lx1, 'y1': ly1})
            amounts.append({'node_key': key, 'header_path': '注記金額', 'amount_text': ''.join(g.text for g in run),
                            'unit_text': record['unit'], 'physical_page': page, 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1})
    # The remark amounts were laid on the account (`<header>／注記／<label>`) for the measurement tools; the
    # note replaces them. A remark whose kind is unknown also leaves the account: it is no amount of it.
    return nodes, amounts, unresolved, dropped, codes


def split_notes(built) -> tuple[list[dict], list[dict], list[dict], list[dict], list]:
    """Node amounts without the notes, the 注記 nodes and amounts, the notes left unadopted, and the
    account-code words printed in the labels of the notes that were laid."""
    nodes, amounts, unresolved, dropped, codes = lay_notes(built)
    kept = [a for a in built.amounts
            if NOTE_SEPARATOR not in a['header_path'] and (a['node_key'], a['header_path']) not in dropped]
    return kept, nodes, amounts, unresolved, codes


def amount_columns(logicals) -> list[dict]:
    """The amount bands in the page's own x (a spread's right page is moved back)."""
    return [{'header': '／'.join(band.header), 'x_range': [band.x0 - band.offset, band.x1 - band.offset]}
            for logical in logicals for band in logical.bands if band.kind == 'amount' and band.x0 - band.offset < band.x1 - band.offset]


def excluded_regions(built, logicals, codes, observed) -> list[dict]:
    """Printed digits the builder knows are not amounts, each with a kind of the shared vocabulary.

    - the account codes in a laid note's label (`02-01-02-15-11-01から流用`): 本文;
    - a ratio column (見出しが割合・率): 数量表, the whole column of that page;
    - a footnote mark (`※1`): 本文;
    - the 合計 row (歳出合計): 総括;
    - a frame that is no expenditure detail (no 款・項・目 column, no 予算現額・支出済額… column): 総括. On a spread its label is printed on the other physical page than its
      amounts, so the coverage check's own same-baseline rule cannot see the label.
    """
    regions = coverage_regions([(g.page, g.original, g.text) for g in codes], kind='本文',
                               reason='注記の文言に印字された流用元・流用先の科目コード。金額は注記金額として取り込み済み。')
    for logical in logicals:
        for band in logical.bands:
            if band.kind == 'label' and RATIO_HEADER.search(''.join(band.header)) and band.x0 - band.offset < band.x1 - band.offset:
                regions.append({'kind': '数量表', 'reason': '比率の欄（見出しが割合・率）。金額の欄ではない。',
                                'pages': [[band.page, band.page]], 'x_range': [band.x0 - band.offset, band.x1 - band.offset]})
    marks = [(page.number, (w.x0, w.y0, w.x1, w.y1), w.text) for page in observed for w in page.words
             if FOOTNOTE_MARK.fullmatch(normalize(w.text))]
    regions += coverage_regions(marks, kind='本文', reason='脚注の番号（※1）。金額ではない。')
    for logical in built.skipped:
        by_page = defaultdict(list)
        for band in logical.bands:
            by_page[band.page].append((band.x0 - band.offset, band.top if band.top is not None else band.body_top,
                                       band.x1 - band.offset, band.body_bottom))
        for page, boxes in by_page.items():
            regions.append({'kind': '総括', 'reason': '款・項・目の欄も予算現額・支出済額の欄も持たない表（流用・繰越の一覧など）。支出の明細ではない。',
                            'page': page, 'bbox': [min(b[0] for b in boxes), min(b[1] for b in boxes),
                                                   max(b[2] for b in boxes), max(b[3] for b in boxes)]})
    totals = [note for note in built.notes if note.get('kind') == 'total amount' and note.get('box')
              and TOTAL_ROW.search(normalize(note.get('label') or ''))]
    regions += [{'kind': '総括', 'reason': '合計の行。款の和には入れない統制値。見開きでは見出しの語が反対の頁にある。',
                 'page': note['page'], 'bbox': list(note['box'])} for note in totals]
    return regions


def frame_words(observed, logicals) -> list[tuple]:
    """The printed words inside the table's ruled frame: what digit coverage must account for.

    A page's title, its folio and a note outside the ruled frame are not cells of the table (every measured
    converter reads the table only). The frame keeps its header cells: the repeated 款・項・目 header is what
    confirms a continued page's codes. A band's rectangle is its rule-bounded strip from the frame's top to its
    last row, in the page's own x (a spread's right page is moved back).
    """
    frames = defaultdict(list)
    for logical in logicals:
        for band in logical.bands:
            frames[band.page].append((band.x0 - band.offset, band.top if band.top is not None else band.body_top,
                                      band.x1 - band.offset, band.body_bottom))
    words = []
    for page in observed:
        for word in page.words:
            x, y = (word.x0 + word.x1) / 2, (word.y0 + word.y1) / 2
            if any(left <= x <= right and top <= y <= bottom for left, top, right, bottom in frames.get(page.number, ())):
                # An item number printed with its separator (`1.` `1．`) is the number `1`: the separator is
                # punctuation, and the builder keeps the number without it.
                words.append((page.number, (word.x0, word.y0, word.x1, word.y1), ITEM_NUMBER.sub(r'\1', word.text)))
    return words


def observation_cache(source: dict, pages: list[int]) -> Path:
    """Local-only cache of the observation (words and rules). The key is the original's identity and the pages."""
    page_key = hashlib.sha256(','.join(map(str, pages)).encode()).hexdigest()[:16]
    return CACHE / 'generic-observation' / f'{source["sha256"]}-{page_key}.json'


@dataclass
class Table:
    nodes: list[dict]          # the builder's nodes and the 注記 nodes
    amounts: list[dict]        # the builder's amounts (notes taken out) and the 注記 amounts
    unresolved: list[dict]     # notes with no kind in the shared dictionary: left unadopted
    excluded: list[dict]       # printed digits that are not amounts, as the coverage scope declares them
    built: object
    report: object
    observed: list
    logicals: list


def build_table(source: dict, options: dict, *, stop: bool = True) -> Table:
    """Everything the converter derives from one original, before anything is written."""
    if source.get('format') != 'pdf' or source.get('pdf_type') != 'text':
        raise ValueError('The generic builder reads text PDFs only')
    account = options['account']
    pages = scope_pages(source, account)
    built, report, observed, logicals = run_pages(
        Path(source['path']), pages, observation_cache(source, pages),
        document_kind=source['target']['document_kind'], account=account, stop=stop,
        partial=bool(options.get('partial')))
    kept, nodes, amounts, unresolved, codes = split_notes(built)
    return Table([*built.nodes, *nodes], [*kept, *amounts], unresolved,
                 excluded_regions(built, logicals, codes, observed), built, report, observed, logicals)


def write_files(destination: Path, table_id: str, table: Table) -> dict:
    """The node and amount tables and the coverage scope of one built table."""
    destination = Path(destination)
    nodes_path = destination / f'{table_id}-nodes.parquet'
    amounts_path = destination / f'{table_id}-amounts.parquet'
    pick = lambda columns, rows: [{c.name: row[c.name] for c in columns} for row in rows]
    write_parquet(nodes_path, pick(NODE_COLUMNS, table.nodes), columns=NODE_COLUMNS)
    write_parquet(amounts_path, pick(AMOUNT_COLUMNS, table.amounts), columns=AMOUNT_COLUMNS)
    # The coverage sidecar is named after the table, not its files: `run.py` and `verify` look for it so.
    write_coverage_words(destination / f'{table_id}.parquet', frame_words(table.observed, table.logicals),
                         amount_columns=amount_columns(table.logicals), excluded_regions=table.excluded)
    return {table_id: {'nodes': nodes_path, 'amounts': amounts_path, 'notes': receipt_notes(table)}}


def receipt_notes(table: Table) -> list[str]:
    """What the receipt says of how the table was read (the unit and its check, the tree, the notes)."""
    unit, pattern = table.report.unit, table.report.pattern
    sources = {key: count for key, count in (pattern.get('units') or {}).items() if count}
    named = '・'.join(f'{key} {count}頁' for key, count in sources.items())
    if unit.get('partial'):
        check = f'分冊のため款の和 {unit.get("kan_sum"):,} と印字の歳出合計は照合していない（分冊をまたぐ照合は検査の外）'
    elif unit.get('printed_total') is not None:
        check = f'款の和 {unit["kan_sum"]:,} と印字の「{unit.get("total_label")}」{unit["printed_total"]:,} が一致'
    else:
        check = f'款の和 {unit.get("kan_sum"):,}（頁に歳出合計の印字なし。桁だけを確かめた）'
    kinds = Counter(n['level_header'] for n in table.nodes if n['axis_header'] == '注記')
    return [
        '汎用のノード生成機（docs/prd/generic-node-builder）が選定の scope の頁を罫線・見出し・字下げ・番号から読んだ。'
        f'科目の段は {pattern.get("chosen")}、内訳の段は {pattern.get("detail")}。',
        f'金額の単位は {named} から決めた。{check}。',
        f'金額の注記 {sum(kinds.values())} 件（{"・".join(f"{k} {v}" for k, v in sorted(kinds.items())) or "なし"}）を注記軸に置いた。'
        + (f'種類を決められなかった注記 {len(table.unresolved)} 件は取り込んでいない。' if table.unresolved else ''),
    ]


def convert(inputs: list[dict], destination: Path, options: dict) -> dict:
    if len(inputs) != 1:
        raise ValueError('The generic builder converts one original per table')
    return write_files(destination, options['table_id'], build_table(inputs[0], options))
