"""Document quirk: under each 目 the statement prints its 事業 again as blocks (`project_blocks`, 133035 当初予算).

The 目 row carries the 目's amounts, its 節 (区分・金額) and, in the 説明, the list of its 事業 with their amounts
(`(1)文書管理費 18,938`). Below it, each 事業 opens with a heading row in the 目 column (`(1)文書管理費`, ruled across the
frame), then a row with the 事業's amounts and its 節 again, the names of the 財源 printed over the amount columns
(`(諸)複写代`), and the 説明 of the 事業 item by item (`1 消耗品費 7,700`). The block runs on over pages until the next 目,
事業 or 項 total (`合計`).

The words are rearranged before the tree is built (`arrange`), so that the 説明 holds each 事業 with its own items:

- the 目 column is read as one band: the rule its body draws a little right of its left edge (the 事業 headings stand
  right of it, the 目 rows cross it) is taken out before the columns are read (`join_subject`), so a 目's code does not
  stand alone in a band of its own (it would be read as an amount the page before carries over);
- the 事業 list of the 目 row's 説明 is left out where blocks follow (総括): each block's heading is that 事業;
- a block's heading moves into the 説明, its 本年度 amount (the first figure of the row under it) with it; the rest of
  that row and the block's 節 are left out (経費内訳: the 目 row holds the 目's amounts and 節, the block's are those
  of one 事業), and so are the names of the 財源 over the amount columns (財源内訳);
- the block's 説明 items stay where they are printed, under the heading moved left of them;
- the row closing each 項 (`合計`) is left out (総括): it adds up the 項's 目 again, and as a row named 合計 it would be
  taken for the account's 歳出合計.

Every word left out is returned with its kind and reason, and its digits become excluded regions of the coverage check.
The heading keeps the place where it is printed; the amount is read on the heading's line at the right end of the 説明 and
keeps the place where it is printed for the coverage check. A 目 with no block keeps its 説明 as printed."""
import re

SCOPE = 'document'
OPTIONS = {'const': True}

HEADING = re.compile(r'^[(（][0-9]+[)）]\S')
SUBJECT = re.compile(r'^[0-9]+\s*\D')
TOTAL = re.compile(r'^合\s*計')
AMOUNT = re.compile(r'^[△▲]?[0-9]{1,3}(?:,[0-9]{3})*$')
TOLERANCE = 4.0


def _role(band) -> str | None:
    head = band.header[-1] if band.header else ''
    if head == '目':
        return 'subject'
    if head == '説明':
        return 'explain'
    if band.header and band.header[0] == '節':
        return 'setsu'
    if band.excluded or band.ignored:
        return 'excluded'
    if band.kind == 'amount':
        return 'amount'
    return None


def join_subject(pages: list) -> list:
    """The pages without the rules a 目 column draws inside it below its header cell (`目(事業)`)."""
    from dataclasses import replace
    result = []
    for page in pages:
        verticals = [r for r in page.rules if r.vertical]
        heads = [w for w in page.words if re.match(r'^目\s*[(（]', w.text)]
        drop = set()
        for word in heads:
            middle = (word.y0 + word.y1) / 2
            crossing = [r for r in verticals if r.y0 - 1 <= middle <= r.y1 + 1]
            left = max((r.x0 for r in crossing if r.x0 <= word.x0 + 1), default=None)
            right = min((r.x0 for r in crossing if r.x0 >= word.x1 - 1), default=None)
            if left is None or right is None:
                continue
            drop |= {id(r) for r in verticals if left + 2 < r.x0 < right - 2 and r.y0 > word.y1}
        result.append(replace(page, rules=[r for r in page.rules if id(r) not in drop]) if drop else page)
    return result


def _merged_subject(logical) -> None:
    subjects = [b for b in logical.bands if _role(b) == 'subject']
    if len(subjects) < 2:
        return
    first = subjects[0]
    for other in subjects[1:]:
        first.x1 = max(first.x1, other.x1)
        first.words = sorted(first.words + other.words, key=lambda g: (g.y0, g.x0))
        first.rows = sorted(set(first.rows) | set(other.rows))
    logical.bands = [b for b in logical.bands if b not in subjects[1:]]


def _lines(logical) -> list[list[tuple]]:
    placed = sorted(((band, g) for band in logical.bands for g in band.words),
                    key=lambda item: ((item[1].y0 + item[1].y1) / 2, item[1].x0))
    result: list[list[tuple]] = []
    for band, glyph in placed:
        middle = (glyph.y0 + glyph.y1) / 2
        if result and glyph.page == result[-1][0][1].page and abs(
                middle - sum((g.y0 + g.y1) / 2 for _, g in result[-1]) / len(result[-1])) <= TOLERANCE:
            result[-1].append((band, glyph))
        else:
            result.append([(band, glyph)])
    return result


SUMMARY = ('総括', '目の行の説明に並べた事業の一覧と金額。事業ごとの欄の見出しと本年度予算額で取り込む。')
TOTAL_ROW = ('総括', '項の終わりの合計の行。項の目の金額を足したもの。')
BLOCK = ('経費内訳', '事業ごとの欄の前年度予算額・比較と節の内訳。目の金額と節は目の行で取り込み、事業は説明の内訳として本年度予算額だけ取り込む。')
FUNDS = ('財源内訳', '事業ごとの欄の金額の上に印字した財源の名前。')


def arrange(logicals: list) -> tuple[list, list[tuple]]:
    """The logical pages rearranged, and the glyphs left out as (glyph, kind, reason)."""
    from ingestion.generic.layout import normalize, text
    from ingestion.generic.patterns.layout.running_titles import Carried
    left_out: dict[int, tuple] = {}
    moved: list[tuple] = []
    summary: list = []  # the 説明 words of the open 目's row, left out once a block follows
    in_block = pending = False
    heading = None

    def leave(glyphs, why):
        for g in glyphs:
            left_out.setdefault(id(g), (g, *why))

    for logical in logicals:
        _merged_subject(logical)
        explain = next((b for b in logical.bands if _role(b) == 'explain'), None)
        for line in _lines(logical):
            roles = {}
            for band, glyph in line:
                roles.setdefault(_role(band), []).append(glyph)
            subject = normalize(text(sorted(roles.get('subject', []), key=lambda g: g.x0)))
            others = [g for role, gs in roles.items() if role not in ('subject', 'excluded') for g in gs]
            if subject and HEADING.match(subject) and not roles.get('explain') and not roles.get('setsu') \
                    and not any(AMOUNT.match(normalize(g.text)) for g in others):
                if not in_block:
                    leave(summary, SUMMARY)
                summary, in_block, pending = [], True, True
                # A heading longer than the 目 column runs on over the rule into the next column (`(1)一般管理` `費`).
                heading = sorted(roles['subject'] + others, key=lambda g: g.x0)
                leave(heading, ('', ''))
                continue
            if subject and TOTAL.match(subject):
                in_block = pending = False
                summary = []
                leave([g for _, g in line], TOTAL_ROW)
                continue
            if subject and SUBJECT.match(subject):
                in_block = pending = False
                summary = list(roles.get('explain', []))
                continue
            if not in_block:
                summary += roles.get('explain', [])
                continue
            amounts = sorted((g for g in roles.get('amount', []) if AMOUNT.match(normalize(g.text))), key=lambda g: g.x0)
            if pending and explain is not None and amounts:
                top, bottom = min(g.y0 for g in heading), max(g.y1 for g in heading)
                first = amounts[0]
                # Read at the right end of the 説明, where its amounts stand: a heading that runs on over the amount
                # columns (`(1)コミュ` `ニティセンタ` `ー運営費`) would otherwise take it into its name.
                width = first.x1 - first.x0
                carried = Carried(first.text, explain.x1 - width - 1, top, explain.x1 - 1, bottom, first.page, first.offset,
                                  printed=first.original)
                moved.append((explain, heading + [carried]))
                leave([first], ('', ''))
                pending = False
            leave(roles.get('setsu', []) + [g for g in roles.get('amount', []) if AMOUNT.match(normalize(g.text))], BLOCK)
            leave(roles.get('subject', []) + [g for g in roles.get('amount', []) if not AMOUNT.match(normalize(g.text))], FUNDS)
    for logical in logicals:
        for band in logical.bands:
            band.words = [g for g in band.words if id(g) not in left_out]
    for band, glyphs in moved:
        band.words = sorted(band.words + glyphs, key=lambda g: (g.y0, g.x0))
    return logicals, [entry for entry in left_out.values() if entry[1]]
