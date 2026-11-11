"""Axis quirk: a line that ends a page prints its amount at the top of the next page, with no name (132292 R8 民生費:
the 積算 `日常生活支援住居施設委託事務費` at the foot of a page, `2,800,000円` on the first line of the next). The amount
is the last line's, as under `wrap: amount_on_last_line`, without reading every name of the axis as wrapping."""
SCOPE = 'axis'
OPTIONS = {'const': True}


def page_of(all_items: list, run: list, default):
    """The logical page that prints the amount `run` (whether it prints 円 is read there, not on the line's page)."""
    page = run[-1].page
    return next((logical for logical, _, _ in all_items
                 if any(glyph.page == page for band in logical.bands for glyph in band.words)), default)
