"""Spreads printed on two facing pages whose subject column is headed `款項目` (港区の予算説明書).

The left page holds the 款・項・目 (their codes in three narrow columns and the names in a fourth, all under one header
cell `款 項 目`) with the amounts and the 財源内訳; the right page holds the 節 and the 説明 of the same rows. The
shared joining (`layout.logical_pages`) takes a page as a spread's right half only when the left half has a column
headed by a level (`款`・`項`・`目`) or `科目`, and when the two pages print the same horizontal rules; here the left
page rules only its header and the right page rules every 目, so the halves stay apart and the 節 would hang under the
last 目 of the left page. A page with a `款項目` column followed by a page with none are joined into one spread.

Every page repeats `（款） 2 総務費` / `（項） 1 総務管理費` above its table. Where the 款 column prints nothing (a
page that goes on with a 項 or 目), the shared reading would take that title as a new 款 item; the titles are the
open 款・項 again, so no titles are read (`level_titles` empty) and the page goes on under them.

The right page rules the purpose of the spread's first 目 (`区議会議員の人件費及び区議会の運営に要する経費`) in a row
right under the `説明` header cell, so it is read as a second header row and the column's header changes with every
spread; on a scan OCR also reads the cell as `說明`, `明` or with the 節 header over it. The column is the label column
right of the 節's amounts (`節／金額`), whatever its header reads: it is `説明` (`EXPLANATION`), the conversion's settings
name it once, and a column declared excluded under that name is left out as `layout.logical_pages` leaves out the
columns it names.
"""
from ingestion.generic import layout

SUBJECT = '款項目'
EXPLANATION = '説明'


def _subject(logical: layout.Logical) -> bool:
    return any(band.header and band.header[-1] == SUBJECT for band in logical.bands)


def read(pages, **options):
    result = []
    for logical in layout.logical_pages(pages, **options):
        amounts = [b for b in logical.bands if b.kind == 'amount' and b.header[:1] == ('節',)]
        for band in logical.bands:
            if (amounts and band.kind == 'label' and band.header != (EXPLANATION,)
                    and any(band.x0 >= a.x1 - 1 and band.offset == a.offset for a in amounts)):
                band.header = (EXPLANATION,)
                setting = (options.get('columns') or {}).get(EXPLANATION) or {}
                if setting.get('excluded'):
                    band.excluded, band.kind = setting['excluded'], None
        previous = result[-1] if result else None
        if (previous is not None and len(previous.pages) == 1 and len(logical.pages) == 1 and _subject(previous)
                and not _subject(logical) and logical.pages[0] == previous.pages[0] + 1):
            offset = max(b.x1 for b in previous.bands) + 10 - min(b.x0 for b in logical.bands)
            for band in logical.bands:
                band.x0 += offset; band.x1 += offset; band.offset = offset
                band.spans = [(a + offset, b + offset, t) for a, b, t in band.spans]
                for word in band.words:
                    word.x0 += offset; word.x1 += offset; word.offset = offset
            previous.pages.extend(logical.pages)
            previous.bands.extend(logical.bands)
            previous.unit = previous.unit or logical.unit
            previous.outside.extend(logical.outside)
            previous.foot.update(logical.foot)
            previous.ocr = previous.ocr or logical.ocr
            previous.column_units.update(logical.column_units)
            continue
        logical.level_titles = []
        result.append(logical)
    return result
