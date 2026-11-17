"""Document quirk: the rules cut one column into several bands of one header (檜原村 R6 当初 国保診療施設勘定の説明:
the names in a narrow band, the amounts in the widest one at the right). An amount alone in its band at the top of a
spread is then no amount the page before carries over (`running_titles.carry_amounts`) when a band of the same header
prints a name on its line (`テレビ受信料` … `16`): it is that name's own amount."""
SCOPE = 'document'
OPTIONS = {'const': True}


def beside_name(band, line, bands) -> bool:
    """A band of `band`'s header other than it prints a word on the line of `line`."""
    page = line[0].page
    middle = (line[0].y0 + line[0].y1) / 2
    return any(other is not band and other.kind == 'label' and other.header == band.header
               and any(w.page == page and w.y0 <= middle <= w.y1 for w in other.words)
               for other in bands)
