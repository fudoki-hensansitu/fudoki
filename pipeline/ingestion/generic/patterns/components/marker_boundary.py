

def split_boundary_token(self, word):
    """Poppler merges a rightmost amount digit with the ○ marker of the 備考
    column (e.g. printed '1' + '○' extracted as '10' at x≈975-990). Split any
    all-digit token straddling x=982 into per-character words. A printed '0'
    amount merges the same way ('oo'); split marker-family tokens too so the
    amount-side fragment normalizes via DIGIT_FIX and the note-side fragment
    stays a heading marker."""
    if not (word['xMin'] < self.BOUNDARY_X < word['xMax']):
        return [word]
    if not (self.NUMBER.fullmatch(word['text']) or self.BOUNDARY_MARKER.fullmatch(word['text'])):
        return [word]
    span = word['xMax'] - word['xMin']
    per = span / len(word['text'])
    parts = []
    for i, ch in enumerate(word['text']):
        parts.append({**word, 'text': ch, 'frag': True,
                      'xMin': word['xMin'] + i * per,
                      'xMax': word['xMin'] + (i + 1) * per})
    return parts


def split_glued_setsu(self, word):
    """A text layer that keeps '1報酬' as one word: split the section number from
    its name at the number column. Widths are estimated per character (a digit is
    half the width of a kanji), so the split lies between the two glyph runs."""
    if not (self.SETSU_NUM[0] <= word['xMin'] < self.SETSU_NUM[1]):
        return [word]
    match = self.GLUED_SETSU.fullmatch(word['text'])
    if not match:
        return [word]
    number, name = match.groups()
    weights = [0.5 if ch.isascii() else 1.0 for ch in word['text']]
    unit = (word['xMax'] - word['xMin']) / sum(weights)
    cut = word['xMin'] + unit * 0.5 * len(number)
    if cut > self.SETSU_NUM[1]:
        return [word]
    # The name keeps to the name band: setsu_record reads names from SETSU_NAME on.
    return [{**word, 'text': number, 'xMax': cut}, {**word, 'text': name, 'xMin': max(cut, self.SETSU_NAME[0])}]

FUNCTIONS = {
    'split_boundary_token': split_boundary_token,
    'split_glued_setsu': split_glued_setsu,
}
