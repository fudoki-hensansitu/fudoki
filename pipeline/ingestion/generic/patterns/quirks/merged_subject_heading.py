"""Document quirk: the subject columns are one column of the names under the 款's title, with a narrow column of the 項's
code at its left, and the header reads both under one heading (132292 R8 当初 介護保険 歳入, scan: `科目` over `項` | `目`,
OCR reads the two small cells as one heading `科目項目` on most pages and as `科目／項` | `科目／目` on some). The 項's
name runs from its code across the rule into the names' column, and the 目 under it is boxed in the names' column. Read
with the subject pattern `indent`, the two columns are the one column of a table whose 款 is printed as a title
(`項 目` under `第1款 保険料`): the 款 comes from the title and the 項・目 from where their codes start, on every page
however OCR read the header."""
SCOPE = 'document'
OPTIONS = {'const': True}

# The 項's code column holds one or two digits: at most this wide (pt).
NARROW = 15.0


def one_heading(bands: list) -> bool:
    """Whether two subject columns stand under one heading and the first is no wider than a code: both read that heading,
    or the 項 and the 目 under one heading over them (`科目／項` | `科目／目`)."""
    if len(bands) != 2 or not bands[0].header or not bands[1].header or bands[0].x1 - bands[0].x0 > NARROW:
        return False
    first, second = tuple(bands[0].header), tuple(bands[1].header)
    return first == second or (first[:-1] == second[:-1] and (first[-1], second[-1]) == ('項', '目'))
