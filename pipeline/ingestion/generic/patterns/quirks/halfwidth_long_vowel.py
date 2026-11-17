"""Document quirk: the document prints katakana in half-width and sets the characters of a short name apart
(`保 健 福 祉` / `ｾ ﾝ ﾀ ｰ` / `使 用 料`, 八丈町の当初予算書 R6 の歳入の節). The half-width prolonged sound mark `ｰ` then
stands alone at the end of a line, and NFKC reads it as the dash of a printed 0: without the quirk it becomes the
line's amount. A lone `ｰ` right after half-width katakana is the end of the name."""
SCOPE = 'document'
OPTIONS = {'const': True}

import re

KANA = re.compile(r'[ｦ-ﾟ]$')


def in_name(before: str, run: str) -> bool:
    """Whether the run read as the line's first amount is the half-width `ｰ` after half-width katakana."""
    return run == 'ｰ' and KANA.search(before) is not None
