"""Document quirk: a subject line starting between its code's end and its name's start wraps that name (`3その他公共施`
/ `設・公用施設`, 133078): a name split from its code by the width of its characters starts too far right."""

SCOPE = 'document'
OPTIONS = {'const': True}


def wraps(previous, item) -> bool:
    return previous.lines[0][0].x1 <= item.indent <= previous.indent
