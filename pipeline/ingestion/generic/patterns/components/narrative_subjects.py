

def parse_kou_heading(self, words, page):
    """項-only見出し行: N項 名称 (予算現額) 決算額 [<前年決算額>]。目を持たない会計用。"""
    if not words:
        return None
    m = self.KOU_HEADING.match(words[0]['text'])
    if not m or words[0]['xMin'] > 80:
        return None
    try:
        iparen = next(i for i in range(2, len(words)) if self.PAREN.match(words[i]['text']))
    except StopIteration:
        return None
    if iparen + 1 >= len(words):
        return None
    rest = words[iparen + 1:]
    if not rest or not self.is_amount(rest[0]['text']):
        return None
    prev_words = rest[1:]
    if prev_words and not self.PREV_TEXT.match(self.squashed(prev_words)):
        return None
    name = self.text_of(words[1:iparen])
    if not name:
        return None
    return {'番号': m.group(1), '名称': name,
            **self.amount_cells(['予算現額', '当年度決算額', '前年度決算額'],
                           {'予算現額': words[iparen]['text'],
                            '当年度決算額': rest[0]['text'],
                            '前年度決算額': self.squashed(prev_words) or None},
                           {'予算現額': [words[iparen]], '当年度決算額': [rest[0]],
                            '前年度決算額': prev_words},
                           page),
            **self.node_x(words[:iparen]),
            **self.position(page, words)}


def parse_moku_heading(self, words, page):
    """項・目の見出し行: N 項名  N 目名  (予算現額)  決算額  [<前年決算額>]。"""
    if not words or not self.is_amount(words[0]['text']) or words[0]['xMin'] > 80:
        return None
    try:
        split = next(i for i in range(1, len(words)) if self.is_amount(words[i]['text']))
    except StopIteration:
        return None
    if split == 1 or words[split]['xMin'] > 250:
        return None
    try:
        iparen = next(i for i in range(split + 1, len(words)) if self.PAREN.match(words[i]['text']))
    except StopIteration:
        return None
    if iparen <= split + 1 or iparen + 1 >= len(words):
        return None
    rest = words[iparen + 1:]
    if not rest or not self.is_amount(rest[0]['text']):
        return None
    prev_words = rest[1:]
    if prev_words and (not self.squashed(prev_words) or not self.PREV_TEXT.match(self.squashed(prev_words))):
        return None
    return {'項_番号': words[0]['text'], '項_名称': self.text_of(words[1:split]),
            '項_物理頁': page, '項_上端': min(w['yMin'] for w in words[:split]),
            '項_下端': max(w['yMax'] for w in words[:split]),
            '項_左端': min(w['xMin'] for w in words[:split]),
            '項_右端': max(w['xMax'] for w in words[:split]),
            '番号': words[split]['text'], '名称': self.text_of(words[split + 1:iparen]),
            **self.amount_cells(['予算現額', '当年度決算額', '前年度決算額'],
                           {'予算現額': words[iparen]['text'],
                            '当年度決算額': rest[0]['text'],
                            '前年度決算額': self.squashed(rest[1:]) or None},
                           {'予算現額': [words[iparen]], '当年度決算額': [rest[0]],
                            '前年度決算額': rest[1:]},
                           page),
            **self.node_x(words[split:iparen]),
            **self.position(page, words)}


def parse_moku_pending(self, words, page):
    """金額行のない項・目見出し行（範囲目含む）。金額は次行で補う。"""
    if not words or not self.is_amount(words[0]['text']) or words[0]['xMin'] > 80:
        return None
    split = next((i for i in range(1, len(words)) if self.is_amount(words[i]['text'])), None)
    if split is None or split == 1 or words[split]['xMin'] > 250:
        return None
    if not words[1:split]:
        return None
    tail = words[split + 1:]
    if not tail or any(self.PAREN.match(w['text']) for w in tail):
        return None
    nums = [w for w in tail if self.is_amount(w['text'])]
    marks = [w for w in tail if self.RANGE_MARK.match(w['text'])]
    if len(nums) > 1 or (nums and not marks):
        return None
    name_words = [w for w in tail if w not in nums]
    if not name_words:
        return None
    return {'項_番号': words[0]['text'], '項_名称': self.text_of(words[1:split]),
            '項_物理頁': page, '項_上端': min(w['yMin'] for w in words[:split]),
            '項_下端': max(w['yMax'] for w in words[:split]),
            '項_左端': min(w['xMin'] for w in words[:split]),
            '項_右端': max(w['xMax'] for w in words[:split]),
            '番号': words[split]['text'] + (marks[0]['text'] + nums[0]['text'] if nums else ''),
            '名称': self.text_of(name_words),
            '物理頁': page, '上端': min(w['yMin'] for w in words),
            '下端': max(w['yMax'] for w in words),
            **self.node_x([words[split], *name_words])}


def parse_moku_amounts(self, words):
    """項・目見出しの次行: (予算現額) 決算額 [<前年決算額>] のみの行。"""
    if not words or not self.PAREN.match(words[0]['text']):
        return None
    rest = words[1:]
    if not rest or not self.is_amount(rest[0]['text']):
        return None
    prev = rest[1:]
    if prev and not self.PREV_TEXT.match(self.squashed(prev)):
        return None
    return ({'予算現額': words[0]['text'], '当年度決算額': rest[0]['text'],
             '前年度決算額': self.squashed(prev) or None},
            {'予算現額': [words[0]], '当年度決算額': [rest[0]], '前年度決算額': prev})


def parse_kan_heading_fragment(self, words, page):
    """款見出しの先頭行: 番号+名称（款名が長く次の行へ折り返す会計用）。

    左欄の先頭語が款番号（1-2桁の数字）で、行内に金額がなく、残語に項見出し・
    marker・括弧金額・前年度額・本文（事務報告書）を含まない行だけを保留する。
    事業見出し（(予算現額)を含む）・項/目見出し（先頭が「N項」）・款集計の
    金額行（桁区切り金額を持つ）はこの形にならない。款番号+名称+本文が1行で
    揃う款見出しは従来の単行分支岐が扱うため対象外。
    """
    head = [w for w in words if w['xMin'] < self.RIGHT_X]
    if not head or not self.KAN_NUMBER.match(head[0]['text']) or head[0]['xMin'] > 110:
        return None
    if self.KAN_TITLE_MARK.search(self.squashed(words)) or len(head) < 2:
        return None
    if any(self.is_amount(w['text']) for w in words[1:]):
        return None
    if any(self.KOU_HEADING.match(w['text']) for w in head[1:]):
        return None
    if any(self.MARKER_ITEM.match(w['text']) or self.MARKER_SUB.match(w['text'])
           or self.PAREN.match(w['text']) or self.PREV.match(w['text']) for w in head[1:]):
        return None
    name = ''.join(w['text'] for w in head[1:])
    if not name:
        return None
    return {'番号': head[0]['text'], '名称': name, 'held': [(page, words)],
            'title': False, **self.position(page, head)}


def kan_name_fragment(self, words):
    """款見出しの名称断片。左欄の款名列（xMax 250 以下）に印字され、
    金額・括弧金額・前年度額・marker・項見出し・本文を含まない行だけを断片とする。
    款集計のラベル行（決算額・資金分解・執行率）は左欄全域に広がるため対象外。
    """
    head = [w for w in words if w['xMin'] < self.RIGHT_X]
    if not head or any(w['xMax'] > 250 for w in head):
        return None
    if self.KAN_TITLE_MARK.search(self.squashed(words)):
        return None
    if any(self.KOU_HEADING.match(w['text']) or self.MARKER_ITEM.match(w['text'])
           or self.MARKER_SUB.match(w['text']) or self.PAREN.match(w['text'])
           or self.PREV.match(w['text']) or self.is_amount(w['text']) for w in head):
        return None
    return ' '.join(w['text'] for w in head) or None

FUNCTIONS = {
    'kan_name_fragment': kan_name_fragment,
    'parse_kan_heading_fragment': parse_kan_heading_fragment,
    'parse_kou_heading': parse_kou_heading,
    'parse_moku_amounts': parse_moku_amounts,
    'parse_moku_heading': parse_moku_heading,
    'parse_moku_pending': parse_moku_pending,
}
