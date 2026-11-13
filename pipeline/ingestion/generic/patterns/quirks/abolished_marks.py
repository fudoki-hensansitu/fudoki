"""Document quirk: a 目 the year drops prints `△` where its code would stand (`△. 東京都知事選挙費 0 7,167 △7,167`,
檜原村; `△ 東京都知事選` / `挙費`, 日の出町). The mark is no part of the name: the item keeps no code and its name
starts after the mark."""
import re

SCOPE = 'document'
OPTIONS = {'const': True}

MARK = re.compile(r'^[△▲][.．]?\s*')


def strip(name: str) -> str:
    return MARK.sub('', name)
