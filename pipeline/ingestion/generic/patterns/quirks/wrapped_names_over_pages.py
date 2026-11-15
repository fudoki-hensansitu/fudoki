"""Axis quirk: a numbered name that wraps over lines (`wrap: amount_on_last_line`) is cut at the foot of a page and runs
on at the top of the axis's next page, with its amount (港区 R8 当初予算の説明: `(4)コミュニティ活動の場の提供（芝管理課、
麻布管理課、` at the foot of one page, `赤坂管理課、…地域振興課）` / `(127,961)` heading the next). The next page's first item
of the axis, printed without a number or a declared mark and with an amount, is the rest of that item when it ended its page
without an amount: not an item of its own. (`names_over_pages` places the rest by where the name starts; a wrapped line
here starts at the wrap indent, not at the name.)"""
SCOPE = 'axis'
OPTIONS = {'const': True}


def runs_on(previous, first) -> bool:
    return (previous.role in ('node', 'note') and previous.code is not None and not previous.amounts and previous.lines
            and first.role == 'node' and first.code is None and first.level is None
            and bool(first.amounts) and bool(first.name) and bool(first.lines) and 0 < first.page - previous.page <= 2)
