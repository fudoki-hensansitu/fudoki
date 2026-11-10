"""Tables under a 款・項 title printed above the frame, again on each page of the 項 (予算事項別明細書).

千代田区の頁は枠の上に `（款） 1 議会費` / `（項） 1 議会費` を、文京区は `1款 議会費 682,709 650,468 32,241` /
`1項 議会費 …` を印字し、枠の中は目の欄から始まる。`layout.Logical.titles` が読むのは款の題字だけなので、
項が木に入らず目が款の直下に付く。ここでは枠の外の語から款・項の題字を上から順に読み、`level_titles`
として木へ渡す（`patterns/layout/stacked_titles` と同じ受け渡し）。継続頁で繰り返す題字は、開いている題字の
再掲として木の組み立てが扱う。

題字の金額は印字された見出しを持たないので、題字の右に金額が並ぶ書式では、最初の金額が属する見出しを設定で
宣言する（`header.title_amount`）。宣言が無ければ題字の金額は読まず、題字の段は子の和で確かめない。
題字の金額は、その款・項の表の始まり（項の最初の目が `1`）と終わり（項の `計` の行）が読む範囲に収まるときだけ読む。
分冊の境で款が2冊にまたがると（文京区は冊の末尾に次の款の最初の見開きを載せる）、どちらの冊にも款・項の一部の目しか
無く、題字の金額は冊の目の和と比べられない。その題字は項目として残し、金額は読まない（`complete_titles`）。

この書式の説明欄は金額の後に単位を印字する（`291,731 千円`、`361,665千円`）。単位は欄の上の印字（`千円`）と同じで、
金額の一部でも名前の一部でもないので、金額の直後の `千円` を欄の語から外す（`tree._split_line` が外すのは `円` だけ）。

文京区の頁は、本文の縦罫を Poppler の線として持たない（見出しの升の縦罫と、目の区切りの短い線だけが取れる）。
見出しの縦罫が本文で途切れるときは、その縦罫を枠の最も下の横罫まで延ばしてから欄を読む。

文京区の説明欄は、名前が欄の右端で折り返すと金額を次の行に印字する。折り返した名前の残りが `計` の1字だけのとき
（`…建物解体工事実施設` / `計 1,839千円`）、`計` は名前の続きなので前の行の末尾へ戻す（そのままでは合計の行として読まれる）。
頁の最後の名前の金額が次の見開きの説明欄の最初の行に印字されるときは（`…法外援護事業` / 次頁の先頭に `343千円`）、
その金額を前の見開きの最後の行で読む（`carry_amounts`）。金額の印字の頁と位置は変えない（`Carried`）。

説明欄の積算の行は全角数字で印字され（`第１子分 月額 ４４，１４０円`、`１人 ５０，０００円`）、文字層はその数字を文字ごとの
語に割ったり（`２` `４` `か` `所`）、名前と金額を1語にしたり（`月額２７，９８０円`）する。割れた全角数字は観測の頁の上で
1語に戻し（桁の網羅の検査も同じ語を読む）、名前に付いた金額は分けて読む。名前の下の行に単独で印字された人数・件数
（`葬祭扶助 ２２，７７６千円` / `１０４人`）は項目にしない。行の種類（積算）は `note_kinds` で宣言する。

スキャンの頁では、欄の右に寄せた金額の枠が右の縦罫を少し越えて読まれる（千代田区 R7 の財源内訳の `6,414` が 354.1 まで、
縦罫は 353.5）。数字は欄の中に印字されているので、1.5pt 未満の越えは縦罫で切る（`inside_rules`。観測の頁の上で切り、
桁の網羅の検査も同じ枠を読む）。
"""
import re

from dataclasses import dataclass, replace

from ingestion.generic import layout
from ingestion.generic.layout import Glyph, is_amount, lines, normalize, runs, text
from ingestion.generic.observe import Rule, Word
from ingestion.generic.patterns.layout import stacked_titles

FULL_REACH = 3  # how far short of the frame's edges a rule may end and still cross the whole frame

# `（款） 1 議会費`・`(項)1 総務管理費`・`（款） 2.総務費` or `1款 議会費`・`第2項 防災費`. The point after the code
# (檜原村) is the code's, not the name's.
PREFIXED = re.compile(r'^[(（](款|項)[)）]([0-9]+)[.．]?([^\d.．].*)$')
SUFFIXED = re.compile(r'^第?([0-9]+)(款|項)(\D.*)$')


# An amount with the unit printed after it, touching it (`361,665千円`).
UNIT_TOUCHING = re.compile(r'^([△▲]?[0-9]{1,3}(?:,[0-9]{3})*)千円$')
UNIT = '千円'
# A reckoning line's yen amount, set in full-width digits and printed as one word with its name (`月額１０，４２０円`).
GLUED_YEN = re.compile(r'^(.*[^0-9０-９,，△▲~～])([０-９]{1,3}(?:，[０-９]{3})+円)$')
SPLIT_GAP = 3.0  # wider than the gap `layout.runs` joins


@dataclass
class Carried(Glyph):
    """A word read on another line than it is printed on: `original` (and `page`) stay where it is printed, so the
    amount keeps its printed place."""
    printed: tuple[float, float, float, float] = (0.0, 0.0, 0.0, 0.0)

    @property
    def original(self) -> tuple[float, float, float, float]:
        return self.printed


def cut_tail(run: list[Glyph], count: int) -> list[Glyph]:
    """The glyphs of a run without its last `count` characters (Poppler splits them anywhere: `8` `4` `2` `千` `円`)."""
    glyphs = list(run)
    while count and glyphs:
        last = glyphs.pop()
        if len(last.text) > count:
            keep = len(last.text) - count
            width = (last.x1 - last.x0) / len(last.text)
            glyphs.append(Glyph(last.text[:keep], last.x0, last.y0, last.x0 + keep * width, last.y1, last.page, last.offset))
            break
        count -= len(last.text)
    return glyphs


def drop_units(words: list[Glyph]) -> list[Glyph]:
    """The words of a column, in their order, without the 千円 printed right after an amount (touching it, or as
    a word of its own less than one character apart: `291,731 千円`)."""
    dropped, replaced = set(), {}
    for page in sorted({w.page for w in words}):
        for line in lines([w for w in words if w.page == page]):
            parts = runs(line)
            for index, run in enumerate(parts):
                shown = normalize(text(run))
                if UNIT_TOUCHING.fullmatch(shown):
                    kept = cut_tail(run, len(UNIT))
                elif shown == UNIT and index and is_amount(normalize(text(parts[index - 1]))) \
                        and run[0].x0 - parts[index - 1][-1].x1 <= run[0].y1 - run[0].y0:
                    kept = []
                else:
                    continue
                for position, glyph in enumerate(run):
                    if position >= len(kept):
                        dropped.add(id(glyph))
                    elif kept[position] is not glyph:
                        replaced[id(glyph)] = kept[position]  # the glyph the unit was cut from
    result = []
    for word in words:
        if id(word) in replaced:
            result.append(replaced[id(word)])
        elif id(word) not in dropped:
            result.append(word)
    return result


def title(name: list[Glyph]) -> tuple[str, str, str] | None:
    value = normalize(text(name))
    match = PREFIXED.match(value)
    if match:
        return match.group(1), match.group(2), match.group(3)
    match = SUFFIXED.match(value)
    if match:
        return match.group(2), match.group(1), match.group(3)
    return None


def titles(logical: layout.Logical, heading: str | None) -> list[tuple[str, str, str, list[Glyph], tuple | None]]:
    """The 款・項 titles above the frame, top to bottom: level, code, name, name glyphs and (heading, amount glyphs)."""
    found = []
    # `outside` holds each page's own coordinates: the lines of a spread are read page by page.
    pages = sorted({g.page for g in logical.outside})
    for line in (line for page in pages for line in lines([g for g in logical.outside if g.page == page])):
        if any(logical.below_foot(g) for g in line):
            continue  # the page's foot (`（款） 1 議会費 （項） 1 議会費` under the frame of a right-hand page)
        for parts in title_segments(runs(line)):
            amounts = []
            while len(parts) > 1 and is_amount(normalize(text(parts[-1]))):
                amounts.insert(0, parts.pop())
            name = [g for part in parts for g in part]
            found_title = title(name)
            if found_title is None:
                continue
            level, code, label = found_title
            amount = (heading, amounts[0]) if amounts and heading else None
            found.append((level, code, label, name, amount))
    return found


MARK = re.compile(r'^[(（](款|項)[)）]')
UNIT_NOTE = re.compile(r'^[(（]単位[:：]')


def title_segments(parts: list[list[Glyph]]) -> list[list[list[Glyph]]]:
    """The runs of a line, cut where a mark opens the next title: 日の出町 prints the 款 and the 項 on one line
    (`（款） 1 議会費 （項） 1 議会費 （単位：千円）`). The unit notation is no title's."""
    segments: list[list[list[Glyph]]] = []
    for run in parts:
        shown = normalize(text(run))
        if UNIT_NOTE.match(shown):
            continue
        if not segments or MARK.match(shown):
            segments.append([run])
        else:
            segments[-1].append(run)
    return segments


def extend_columns(page):
    """The page with each vertical rule run up and down to the nearest rules that cross the whole frame.

    The body's vertical rules are taken only next to the row rules (a few points around each), so a column's
    rule is a series of pieces. A piece runs up to the full-width rule above it and down to the one below it:
    two tables stacked on a page keep the gap between them (the bottom rule of one and the top rule of the next
    are both full width), and a column whose rule shows only in the header runs down to the table's next rule."""
    horizontals = [r for r in page.rules if not r.vertical]
    verticals = [r for r in page.rules if r.vertical]
    if not horizontals or not verticals:
        return page
    left, right = min(r.x0 for r in horizontals), max(r.x1 for r in horizontals)
    full = full_rules(page)
    added = []
    for rule in verticals:
        if not left - 1 <= rule.x0 <= right + 1:
            continue
        above = [y for y in full if y <= rule.y0 + 1]
        below = [y for y in full if y >= rule.y1 - 1]
        # Not up to the frame's top rule: a rule of the header that starts under a spanning cell (`節` over
        # `区分`・`金額`) stays under it.
        if above and above[-1] > full[0] and rule.y0 - above[-1] > 1:
            added.append(Rule(rule.x0, above[-1], rule.x0, rule.y0))
        if below and below[0] - rule.y1 > 1:
            added.append(Rule(rule.x0, rule.y1, rule.x0, below[0]))
    return replace(page, rules=[*page.rules, *added]) if added else page


def drop_outside_columns(page):
    """The page without the vertical rules drawn wholly above or below the rules that cross the whole frame.

    A box printed under the table (中野区の総括の頁の注記の枠) draws its own sides: counted as column edges, the
    right side (523.7) splits the 一般財源 column (519.4–579.4) and its figures fall between two bands."""
    full = full_rules(page)
    if len(full) < 2:
        return page
    top, bottom = full[0], full[-1]
    kept = [r for r in page.rules if not r.vertical or (r.y1 >= top - 1 and r.y0 <= bottom + 1)]
    return replace(page, rules=kept) if len(kept) < len(page.rules) else page


HEADLESS_LINE = 15  # how far under the frame's top rule the first line of a header-less frame prints


def headless_top(page) -> tuple[float, float] | None:
    """(top, gap) of a frame at the top of the page that prints no header: the rows of the previous page's table
    go on under its top rule (説明 lines and its `計`), and the next table opens under its own header below a stretch
    no column rule crosses (日の出町 R8 p43). None when the page's first frame opens with a header."""
    full = full_rules(page)
    if len(full) < 3:
        return None
    left = min(r.x0 for r in page.rules if not r.vertical)
    right = max(r.x1 for r in page.rules if not r.vertical)
    columns = [r for r in page.rules if r.vertical and left + 1 < r.x0 < right - 1]
    top = full[0]
    for upper, lower in zip(full[1:], full[2:]):
        if any(r.y0 < lower - 1 and r.y1 > upper + 1 for r in columns):
            continue
        first = [w for w in page.words if left < (w.x0 + w.x1) / 2 < right and top < (w.y0 + w.y1) / 2 < top + HEADLESS_LINE]
        if any(re.search(r'[0-9０-９]', w.text) for w in first):
            return top, upper
        return None
    return None


def in_headless_top(page, found: tuple[float, float]):
    """Whether a word is printed in the header-less frame (`headless_top`)."""
    top, gap = found
    left = min(r.x0 for r in page.rules if not r.vertical)
    right = max(r.x1 for r in page.rules if not r.vertical)
    return lambda w: left < (w.x0 + w.x1) / 2 < right and top < (w.y0 + w.y1) / 2 < gap


def without_headless_rules(page, found: tuple[float, float]):
    """The page as the layout reads it: the header-less frame's rules left out, so the frame under the stretch is
    read with its own header. The frame's words are left out too and read in that frame's columns
    (`read_headless_rows`)."""
    gap = found[1]
    return replace(page, rules=[r for r in page.rules if not (r.vertical and r.y1 <= gap + 1)
                                and not (not r.vertical and r.y0 <= gap + 1)])


def read_headless_rows(logicals: list[layout.Logical], upper: dict) -> None:
    """The words of a header-less frame go to the columns of the frame under it, at the place they are printed:
    above that frame's header, so the tree reads them before the titles that open the next table."""
    for logical in logicals:
        for band in logical.bands:
            for word in upper.get(band.page, ()):
                start = word.x0 + min(2, (word.x1 - word.x0) / 2)
                if re.match(r'^[△▲]|.*,[0-9]{3}', word.text) and is_amount(word.text):
                    start = (word.x0 + word.x1) / 2  # a grouped amount belongs to the column that holds most of it
                if band.x0 - band.offset < start < band.x1 - band.offset:
                    band.words.append(Glyph(word.text, word.x0 + band.offset, word.y0, word.x1 + band.offset, word.y1,
                                            band.page, band.offset))
            band.words.sort(key=lambda g: (g.y0, g.x0))


def full_rules(page) -> list[float]:
    """The heights of the horizontal rules that cross the whole frame."""
    horizontals = [r for r in page.rules if not r.vertical]
    if not horizontals:
        return []
    left, right = min(r.x0 for r in horizontals), max(r.x1 for r in horizontals)
    return sorted(r.y0 for r in horizontals if r.x0 <= left + FULL_REACH and r.x1 >= right - FULL_REACH)


def between_tables(logical: layout.Logical, verticals: dict, full: dict) -> list[tuple[layout.Band, Glyph]]:
    """The words of the bands printed between the bottom rule of one table and the top rule of the next: the next
    table's 款・項 titles, with its headings and unit marks above them.

    The words of a stretch between two full-width rules that no column rule crosses are candidates; of them, the
    lines down to the last line that reads as a title move out. A stacked table whose body draws no column rule
    (its rows printed without row rules) keeps its rows: no title line follows them in the stretch."""
    candidates = []
    for band in logical.bands:
        rules = full[band.page]
        for word in band.words:
            if not stacked_titles.between_tables(word, band, verticals[band.page]):
                continue
            middle = (word.y0 + word.y1) / 2
            above = [y for y in rules if y < middle]
            below = [y for y in rules if y > middle]
            if above and below:
                candidates.append((band, word, (band.page, above[-1], below[0])))
    moved = []
    for stretch in dict.fromkeys(c[2] for c in candidates):
        inside = [(band, word) for band, word, at in candidates if at == stretch]
        glyphs = [Glyph(w.text, *w.original, w.page, 0) for _, w in inside]
        last = None
        for line in lines(glyphs):
            parts = runs(line)
            while len(parts) > 1 and is_amount(normalize(text(parts[-1]))):
                parts.pop()
            if title([g for part in parts for g in part]) is not None:
                last = max(g.y1 for g in line)
        if last is not None:
            moved.extend((band, word) for band, word in inside if (word.y0 + word.y1) / 2 <= last)
    return moved


def subject_events(logical: layout.Logical) -> list[tuple]:
    """The 目 column's rows and the titles of a logical page in reading order: ('title', index), ('moku', code)
    and ('total',)."""
    events = [((t[3][0].page, t[3][0].y0), ('title', index)) for index, t in enumerate(logical.level_titles or [])]
    for band in logical.bands:
        if not band.header or band.header[-1] != '目':
            continue
        for line in lines(band.words):
            shown = normalize(text(line))
            code = re.match(r'^([0-9]+)\D', shown)
            if shown == '計':
                events.append(((line[0].page, line[0].y0), ('total',)))
            elif code:
                events.append(((line[0].page, line[0].y0), ('moku', code.group(1))))
    return [event for _, event in sorted(events, key=lambda e: e[0])]


def complete_titles(logicals: list[layout.Logical]) -> None:
    """Drop the amount of a 款・項 title whose table the pages read do not hold whole (see the module doc)."""
    kan, kou = None, None  # the open (款 code) and (款 code, 項 code)
    opened, closed, kous_of = {}, set(), {}
    for logical in logicals:
        for event in subject_events(logical):
            if event[0] == 'title':
                level, code = logical.level_titles[event[1]][:2]
                if level == '款':
                    kan = code
                    kous_of.setdefault(kan, [])
                else:
                    if (kan, code) != kou:
                        kou = (kan, code)
                        if kou not in kous_of.setdefault(kan, []):
                            kous_of[kan].append(kou)
            elif event[0] == 'moku' and kou is not None and kou not in opened:
                opened[kou] = event[1] == '1'
            elif event[0] == 'total' and kou is not None:
                closed.add(kou)
    whole_kou = {k for k in opened if opened[k] and k in closed}
    whole_kan = {k for k, kous in kous_of.items()
                 if kous and kous[0][1] == '1' and all(k2 in whole_kou for k2 in kous)}
    kan = None
    for logical in logicals:
        kept = []
        for level, code, name, glyphs, amount in logical.level_titles or []:
            if level == '款':
                kan = code
            whole = kan in whole_kan if level == '款' else (kan, code) in whole_kou
            kept.append((level, code, name, glyphs, amount if whole else None))
        logical.level_titles = kept


def amounts_only(line: list[Glyph]) -> bool:
    return bool(line) and all(is_amount(text(run)) for run in runs(sorted(line, key=lambda w: w.x0)))


def priced(run: list[Glyph]) -> bool:
    """An amount, with or without the unit printed after it (`22,776`, `２２，７７６千円`, `５０，０００円`)."""
    return is_amount(re.sub(r'千?円$', '', normalize(text(run))))


def has_amount(line: list[Glyph]) -> bool:
    """An amount after the line's name (the item number before it, `2 小・中学生…`, reads as a number too)."""
    parts = runs(sorted(line, key=lambda w: w.x0))
    named = next((i for i, run in enumerate(parts) if not is_amount(text(run))), len(parts))
    return any(priced(run) for run in parts[named + 1:])


YEN = re.compile(r'^[０-９]{1,3}(?:，[０-９]{3})+円$')


def join_split_yen(words: list[Glyph]) -> list[Glyph]:
    """A full-width yen amount the text layer cuts in two touching words (`１` `０，４２０円`) is one word."""
    result: list[Glyph] = []
    for word in sorted(words, key=lambda w: (w.page, round((w.y0 + w.y1) / 2), w.x0)):
        last = result[-1] if result else None
        if (last is not None and last.page == word.page and abs(last.y0 - word.y0) < 1 and 0 <= word.x0 - last.x1 < 0.5
                and re.fullmatch(r'[０-９，]+', last.text) and YEN.match(last.text + word.text)):
            result[-1] = Glyph(last.text + word.text, last.x0, last.y0, word.x1, max(last.y1, word.y1), last.page, last.offset)
            continue
        result.append(word)
    return result


def split_glued_yen(words: list[Glyph]) -> list[Glyph]:
    """A name and its yen amount printed as one word (`第２子加算分` / `月額１０，４２０円`) are two runs: the amount
    reads as the line's amount, as it does where the text layer sets it apart (`月額 ４４，１４０円`)."""
    result = []
    for word in words:
        found = GLUED_YEN.match(word.text)
        if not found:
            result.append(word)
            continue
        width = (word.x1 - word.x0) / len(word.text)
        cut = word.x0 + len(found.group(1)) * width
        result.append(Glyph(found.group(1), word.x0, word.y0, cut - SPLIT_GAP, word.y1, word.page, word.offset))
        result.append(Glyph(found.group(2), cut, word.y0, word.x1, word.y1, word.page, word.offset))
    return result


COUNT = re.compile(r'^[０-９]+(人|グループ|件|団体)$')
# A count printed on a line of its own under the line it counts (`葬祭扶助 ２２，７７６千円` / `１０４人`).
COUNT_LINE = re.compile(r'^[０-９]{1,3}(?:，[０-９]{3})*(人|世帯|件|か所|団体|グループ)$')


def rejoin_total_tails(words: list[Glyph]) -> list[Glyph]:
    """Two lines the 説明 column breaks that are one: the words go back to the end of the line above, which has no
    amount of its own, and the amount stays on its line under it.

    - a name wrapped before its last character `計` (`…実施設` / `計 1,839千円`), which would read as a total row;
    - a count in full-width digits under the line it counts (`丹羽教育研究奨励賞（個人賞）` / `１人 ５０，０００円`),
      whose digits would read as an item number (the column numbers its items in half-width digits).

    A count on a line of its own under a line with an amount (`葬祭扶助 ２２，７７６千円` / `１０４人`) is a quantity
    of that line, not an item: it is not read as one (its digits are a quantity to the coverage check)."""
    moved, dropped = {}, set()
    for page in sorted({w.page for w in words}):
        found = lines([w for w in words if w.page == page])
        for above, line in zip(found, found[1:]):
            line = sorted(line, key=lambda w: w.x0)
            parts = runs(line)
            if len(parts) == 1 and COUNT_LINE.match(text(parts[0])) and has_amount(above):
                dropped.update(id(w) for w in line)
                continue
            if len(parts) != 2 or not above or has_amount(above):
                continue
            head = text(parts[0])
            last = max(above, key=lambda w: w.x1)
            if normalize(head) == '計' and is_amount(text(parts[1])) and parts[0][0].x0 < last.x1:
                start = last.x1
            elif COUNT.match(head) and YEN.match(text(parts[1])):
                start = last.x1 + (last.y1 - last.y0)  # a character apart
            else:
                continue
            for glyph in parts[0]:
                width = glyph.x1 - glyph.x0
                moved[id(glyph)] = Carried(glyph.text, start, last.y0, start + width, last.y1, glyph.page, glyph.offset, glyph.original)
                start += width
    return [moved.get(id(w), w) for w in words if id(w) not in dropped]


def carry_amounts(logicals) -> None:
    """The amount of the last name of a column, printed alone on the first line of the same column of the next
    logical page: it is read on that name's line, and keeps the page and place it is printed at."""
    for before, after in zip(logicals, logicals[1:]):
        for band in after.bands:
            if band.kind != 'label' or not band.words:
                continue
            target = next((b for b in before.bands if b.kind == 'label' and b.header == band.header and b.words), None)
            if target is None:
                continue
            first = lines(band.words)[0]
            last = lines(target.words)[-1]
            if not amounts_only(first) or has_amount(last):
                continue
            anchor = last[0]
            gone = {id(w) for w in first}
            band.words = [w for w in band.words if id(w) not in gone]
            target.words = target.words + [Carried(w.text, w.x0 - w.offset + anchor.offset, anchor.y0, w.x1 - w.offset + anchor.offset,
                                                   anchor.y1, w.page, anchor.offset, w.original) for w in first]


FULL_WIDTH_DIGIT = re.compile(r'^[０-９]')


def join_full_width(words: list[Word]) -> list[Word]:
    """A run of full-width digits the text layer cuts into touching words (`２` `４` `か` `所`, `２` `０・２５・３０`)
    is one word, from its first digit to the last word that touches it, as `repair` joins half-width numbers."""
    result: list[Word] = []
    for word in sorted(words, key=lambda w: (round((w.y0 + w.y1) / 2), w.x0)):
        last = result[-1] if result else None
        if (last is not None and FULL_WIDTH_DIGIT.match(last.text) and abs((last.y0 + last.y1) / 2 - (word.y0 + word.y1) / 2) < 1
                and abs(word.x0 - last.x1) < 0.5):
            result[-1] = Word(last.text + word.text, last.x0, min(last.y0, word.y0), word.x1, max(last.y1, word.y1))
            continue
        result.append(word)
    return result


OVERSHOOT = 1.5


def inside_rules(words: list[Word], rules) -> list[Word]:
    """An amount whose box the scan reads a little past its column's right rule (`6,414` to 354.1 by a rule at
    353.5) ends at the rule: the digits are printed inside the column, and only the box overshoots."""
    verticals = [r for r in rules if r.vertical]
    result = []
    for word in words:
        middle = (word.y0 + word.y1) / 2
        if word.text[-1:].isdigit():
            crossing = [r.x0 for r in verticals if r.y0 <= middle <= r.y1 and word.x1 - OVERSHOOT < r.x0 < word.x1
                        and r.x0 - word.x0 > (word.x1 - word.x0) / 2]
            if crossing:
                word = Word(word.text, word.x0, word.y0, min(crossing), word.y1)
        result.append(word)
    return result


def read(pages, **options):
    extended, upper = [], {}
    for page in pages:
        # On the observed page itself: digit coverage reads the same words (`runtime.run_pages`).
        page.words = join_full_width(page.words)
        wide = drop_outside_columns(page)
        headless = headless_top(wide)
        inside = in_headless_top(wide, headless) if headless else None
        wide = extend_columns(without_headless_rules(wide, headless) if headless else wide)
        page.words = inside_rules(page.words, wide.rules)
        if headless:
            upper[page.number] = [w for w in page.words if inside(w)]
        extended.append(replace(wide, words=[w for w in page.words if not inside(w)] if headless else page.words))
    pages = extended
    logicals = layout.logical_pages(pages, **options)
    read_headless_rows(logicals, upper)
    heading = (options.get('header') or {}).get('title_amount')
    full = {page.number: full_rules(page) for page in pages}
    verticals = {page.number: [rule for rule in page.rules if rule.vertical and rule.y1 - rule.y0 >= stacked_titles.MIN_RULE]
                 for page in pages}
    for logical in logicals:
        # A second table on the page opens under titles printed in the first one's columns (between the bottom
        # rule of one and the top rule of the next): those words are outside the tables.
        moved = between_tables(logical, verticals, full)
        gone = {id(w) for _, w in moved}
        for band in logical.bands:
            band.words = rejoin_total_tails(join_split_yen(split_glued_yen(drop_units([w for w in band.words if id(w) not in gone]))))
        logical.outside.extend(Glyph(w.text, *w.original, w.page, 0) for _, w in moved)
        logical.level_titles = titles(logical, heading)
    carry_amounts(logicals)
    if heading:
        complete_titles(logicals)
    return logicals
