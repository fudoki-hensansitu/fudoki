"""One page printing several ruled tables one under another, each under its own title: only the 歳入 table is read.

The revenue side of `purpose_section` (三宅村の「財政のあらまし」, 133817): the table under the title `◎ 歳 入`, down to
the first line below it that no vertical rule crosses (the title of the 目的別 table). The lead sentence above the
tables also names 歳入 (`…歳入歳出決算の内容は…`), so the title is the line that prints 歳入 and nothing more.
"""
from ingestion.generic import layout
from ingestion.generic.patterns.layout.purpose_section import section


def read(pages, **options):
    return layout.logical_pages([section(page, '歳入', whole=True) for page in pages], **options)
