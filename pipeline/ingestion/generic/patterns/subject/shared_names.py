import dataclasses
from ingestion.generic.layout import lines, normalize
from ingestion.generic.tree import CODE, _cell, code_columns

# How far right of the shared column's left edge a 目 number printed in it starts (a 節 number starts further in).
CODE_WIDTH = 12


def select(bands):
    """款・項・目 codes in their own narrow columns, their names in the column the 節 shares.

    The name column sits under the last level's header (`目／節／区分`), so a 款 or 項 name (`1 議 会 費`, its
    letters spaced across the code columns) and a 目 name are printed in it with the 節 lines. A line whose code is
    printed in a level column is the subject's own: its words in the name column go to a copy of the column that the
    subject group reads. The lines left in the column are the breakdown's (節), which the column keeps as its own.

    A page with no 節 rows draws no rule between the 目 number and its name, so the column is one: its lines that
    open with a number at its left edge are the 目 (`1 予備費`), and the number gets a column of its own.
    """
    subject_bands, mode, count = code_columns(bands)
    if not subject_bands:
        return subject_bands, mode, count
    last = subject_bands[-1]
    following = bands.index(last) + 1
    if following >= len(bands):
        return subject_bands, mode, count
    shared = bands[following]
    split = getattr(shared, 'subject_split', None)  # the split is made once; a later call finds the column already split
    if split is not None:
        return [*subject_bands, *split], mode, count + len(split) - 1
    if shared.kind != 'label':
        return subject_bands, mode, count
    under_last = shared.header[:len(last.header)] == last.header and shared.header != last.header
    holds_moku = last.header[-1] != '目' and '目' in shared.header
    if not (under_last or holds_moku):
        return subject_bands, mode, count
    edge = shared.x0 + CODE_WIDTH
    numbers = [w for line in lines(shared.words) for w in line[:1] if holds_moku and CODE.match(normalize(w.text)) and w.x0 < edge]
    coded = [line_centre(line) for line in lines([w for band in subject_bands for w in band.words])
             if any(CODE.match(normalize(w.text)) for w in line)]
    coded += [(w.y0 + w.y1) / 2 for w in numbers]
    # The name of a subject runs over the lines of its ruled cell, the number printed between them (`12` beside
    # `人権同和・男女` / `共同参画推進費`), so the lines of the cell are the subject's, not only the number's own line.
    cells = {_cell(shared, y) for y in coded}
    own, rest = [], []
    for line in lines(shared.words):
        centre = line_centre(line)
        (own if _cell(shared, centre) in cells or any(abs(centre - y) <= 3 for y in coded) else rest).extend(line)
    if not own:
        return subject_bands, mode, count
    if holds_moku:
        header = shared.header[:shared.header.index('目') + 1]
        number_ids = {id(w) for w in numbers}
        code_band = dataclasses.replace(shared, x1=edge, header=header, words=[w for w in own if id(w) in number_ids])
        names = dataclasses.replace(shared, x0=edge, header=header, words=[w for w in own if id(w) not in number_ids])
        split = [code_band, names]
    else:
        split = [dataclasses.replace(shared, words=own, header=last.header)]
    shared.words = rest
    shared.subject_split = split
    return [*subject_bands, *split], mode, count + len(split) - 1


def line_centre(line):
    return sum((w.y0 + w.y1) / 2 for w in line) / len(line)
