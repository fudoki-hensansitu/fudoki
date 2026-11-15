"""Document quirk: a year in a name wraps in the middle of its digits (`全国自治体シンポジウム2` / `023負担金`, 132101 R5
決算の備考). The whole of the next line's word goes on the line above, so neither part is read as an amount or a
code. OCR may read the digits ending the line as a word of their own (`全国自治体シンポジウム` `2`). Only digits that
make a year (19xx or 20xx) together are joined. Read by `scan.join_ordinals`."""
import re

SCOPE = 'document'
OPTIONS = {'const': True}


def join(words: list, middle) -> list:
    from ingestion.generic.observe import Word
    from ingestion.generic.scan import ORDINAL_GAP
    words = list(words)
    for index, word in enumerate(words):
        found = word is not None and re.fullmatch(r'([0-9]{1,3})([^0-9\s].*)', word.text)
        if not found or any(w is not None and w is not word and abs(middle(w) - middle(word)) < 3
                            and w.x1 <= word.x0 + 0.5 for w in words):
            continue
        above = [w for w in words if w is not None and 6 < middle(word) - middle(w) < 14
                 and w.x0 < word.x0 + 120 and w.x1 > word.x0]
        last = max(above, key=lambda w: w.x1) if above else None
        left = [w for w in words if last is not None and w is not None and w is not last
                and abs(middle(w) - middle(last)) < 3 and 0 <= last.x0 - w.x1 <= ORDINAL_GAP]
        start = left[0] if left and re.fullmatch(r'[0-9]{1,3}', last.text) else last
        head = last and re.search(r'([^\W\d_])([0-9]{1,3})$', (start.text if start is not last else '') + last.text)
        if not head or not re.fullmatch(r'(19|20)[0-9]{2}', head.group(2) + found.group(1)):
            continue
        words[words.index(last)] = Word(start.text + last.text + word.text if start is not last else last.text + word.text,
                                        start.x0, min(start.y0, last.y0), last.x1, max(start.y1, last.y1))
        if start is not last:
            words[words.index(start)] = None
        words[index] = None
    return words
