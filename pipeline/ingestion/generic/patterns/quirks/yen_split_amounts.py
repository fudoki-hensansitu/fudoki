"""Document quirk: Poppler cuts a reckoning's amount in yen into two words (132292 R6 民生費: `12,49` `8,500円`,
`1` `,010,000円`). Touching digit groups join into one number (`repair._continues`), but the 円 kept the right part
from reading as digits: the right part is read without its 円 when it decides whether the parts are one amount."""
SCOPE = 'document'
OPTIONS = {'const': True}


def digits(text: str) -> str:
    return text[:-1] if text.endswith('円') else text
