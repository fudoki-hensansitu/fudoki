

def parse_jigyo_heading(self, words, page):
    """事業の見出し行: [番号] 名称  担当課  (予算現額)  決算額。"""
    paren = [w for w in words if self.PAREN.match(w['text']) and 399 <= w['xMin'] < 505]
    decided = [w for w in words if self.is_amount(w['text']) and 470 <= w['xMin'] and w['xMax'] <= 585]
    if len(paren) != 1 or len(decided) != 1:
        return None
    head = [w for w in words if w['xMax'] <= paren[0]['xMin']]
    if not head:
        return None
    number = None
    if self.is_amount(head[0]['text']) and head[0]['xMin'] < 70:
        number = head[0]['text']
        head = head[1:]
    segs = []
    for w in head:
        if segs and w['xMin'] - segs[-1][-1]['xMax'] > 6:
            segs.append([])
        if segs:
            segs[-1].append(w)
        else:
            segs.append([w])
    dept_words = []
    while len(segs) >= 2 and self.DEPT_SUFFIX.search(self.squashed(segs[-1])):
        dept_words = segs.pop() + dept_words
    name_words = [w for seg in segs for w in seg]
    if not name_words:
        return None
    return {'番号': number, '名称': self.text_of(name_words),
            '担当課': self.text_of(dept_words) if dept_words else None,
            '予算現額': paren[0]['text'], '当年度決算額': decided[0]['text'],
            '前年度決算額': None, '説明': None,
            **self.position(page, words)}


def parse_jigyo_continuation(self, words):
    """事業見出しの次行: 追加の担当課と <前年度決算額>。"""
    prev = [w for w in words if self.PREV.match(w['text'])]
    if not prev or not self.PREV_TEXT.match(self.squashed(prev)):
        return None
    others = [w for w in words if w not in prev]
    if any(w['xMin'] < 230 for w in others):
        return None
    return {'前年': self.squashed(prev),
            '課': self.text_of([w for w in others if w['xMin'] < self.RIGHT_X]) if others else None,
            'annex': [w for w in others if w['xMin'] >= self.RIGHT_X]}

FUNCTIONS = {
    'parse_jigyo_continuation': parse_jigyo_continuation,
    'parse_jigyo_heading': parse_jigyo_heading,
}
