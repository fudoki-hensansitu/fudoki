"""Document quirk: a 款 title and its 項 title printed on one line (`2款 総務費 1項 総務管理費`, 132080, 132225): the 項
follows its 款, whichever OCR boxed a little higher."""

SCOPE = 'document'
OPTIONS = {'const': True}


def follow(before, title, line) -> None:
    if (before.page == title.page and title.title_depth > before.title_depth
            and abs(title.anchor - before.anchor) < (line[0].y1 - line[0].y0) / 2):
        title.fixed_anchor = before.anchor + .01
