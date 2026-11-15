"""Document quirk: the document letter-spaces its full-width amounts (`９ ２ ，７ ６ ５`, 北区 当初予算の説明 in scan), and
Paddle reads the digits of one amount as fragments a character apart (`9` `2` `,` `76` `5`). Fragments of numbers this
share of the line height apart or nearer are one amount (the value; a comma joins at twice the share). Two amounts of
one line (`1,150.5` and `13,806` of a reckoning) stand farther apart."""

import re

SCOPE = 'document'
OPTIONS = {'type': 'number', 'exclusiveMinimum': 0.6, 'maximum': 1.5}

WIDE = str.maketrans('０１２３４５６７８９，', '0123456789,')


def half_width(word):
    """A fragment Paddle read in full-width digits, spaced or not (`２ ２`, `4２0`), in half-width digits without its spaces,
    so that it joins the other fragments of its amount. A fragment with any other character is left as read."""
    shown = re.sub(r'\s+', '', word.text.translate(WIDE))
    if shown and re.fullmatch(r'[0-9,]+', shown):
        return type(word)(shown, word.x0, word.y0, word.x1, word.y1)
    return word
