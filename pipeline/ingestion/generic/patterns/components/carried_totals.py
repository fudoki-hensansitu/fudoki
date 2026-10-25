
def total_row(self, pages):
    for page, words in pages:
        by_y = {}
        for w in words:
            if w['xMax'] >= 150 or not (self.BODY_TOP < w['yMin'] < self.BODY_BOTTOM):
                continue
            if w['text'] in self.TOTAL_LABEL:
                by_y.setdefault(round(w['yMin'], 1), []).append(w['text'])
        for y, texts in by_y.items():
            if all(t in texts for t in self.TOTAL_LABEL):
                return {page: y}
    raise ValueError('Expenditure total row not found')


def read_total(self, pages, total_page, total_y):
    words = self.words_of(pages, total_page)
    total = {k: self.cell_amount(words, total_y, b)[0]
             for k, b in zip(self.PARENT_AMOUNTS, self.AMOUNT_EDGES) if k != '翌年度繰越額'}
    zone = [w for w in words if 780 <= w['xMin'] and w['xMax'] < 870
            and total_y - 12 <= w['yMin'] <= total_y + 60]
    bands = {}
    for w in zone:
        bands.setdefault(round(w['yMin'], 1), []).append(w)
    lines = [(y, self.joined(ws)) for y, ws in sorted(bands.items())]
    carry = []
    for label in self.TOTAL_CARRY_LABELS:
        hit = [(y, text) for y, text in lines if label in text]
        if len(hit) != 1:
            raise ValueError(f'Total carryover label {label} unresolved')
        zeros = [w for w in words if 840 <= w['xMin'] and w['xMax'] < 868
                 and hit[0][0] - 1.2 <= w['yMin'] <= hit[0][0] + 12
                 and w['text'] == '0']
        if len(zeros) != 1:
            raise ValueError(f'Total carryover amount for {label} unresolved')
        carry.append({'区分': label, '金額': '0'})
    total = {'物理頁': total_page, '上端': total_y, **total,
             '翌年度繰越額_内訳': carry}
    return total


FUNCTIONS = {
    'total_row': total_row,
    'read_total': read_total,
}
