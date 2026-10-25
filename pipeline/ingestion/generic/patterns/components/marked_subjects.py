from __future__ import annotations
import re


def parent_event(self, row, page, page_words=None):
    left = [w for w in row if w['x'] < 142 and (w['x'] < 60 or not self.AMOUNT.fullmatch(w['text']))]
    match = re.match(r'^（([款項目])）\s*([0-9]+)\s*(.*)$', self.text(left))
    if not match:
        return None
    values = []
    sign = ''
    sign_words = []
    for w in row:
        if w['x'] < 130 or w['x'] > 1025:
            continue
        # Poppler sometimes joins the last 0 in one cell to the next cell's △.
        for part in re.findall(r'△|[0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?|（[0-9.]+）|\([0-9.]+\)', w['text']):
            if part == '△':
                sign = part
                sign_words = [w]
            else:
                words = [*sign_words, w] if sign else [w]
                values.append(((sign + part) if sign else part, words))
                sign = ''
                sign_words = []
    if len(values) != len(self.FINANCIAL):
        raise ValueError(f'Parent monetary columns are incomplete: page={page}, {self.text(row)}, values={[v for v, _ in values]}')
    name = match[3]
    name_words = []
    if page_words:
        center = (min(w['y'] for w in left) + max(w['ye'] for w in left)) / 2
        name_words = [w for w in page_words if 55 < w['x'] < 142
                      and abs((w['y'] + w['ye']) / 2 - center) < 11
                      and (not self.AMOUNT.fullmatch(w['text']) or w['xe'] < 130)
                      and w['text'] not in ('円', '％')]
        if name_words:
            name = '\n'.join(self.text(r) for r in self.rows(name_words))
    return {'level': match[1], '番号': match[2], '名称': name,
            **{key: value for key, (value, _) in zip(self.FINANCIAL, values, strict=True)},
            **{k: v for key, (_, words) in zip(self.FINANCIAL, values, strict=True)
                for k, v in self.origin_position(key, page, words).items()},
            **self.coordinates([*row, *name_words], page)}

FUNCTIONS = {
    'parent_event': parent_event,
}
