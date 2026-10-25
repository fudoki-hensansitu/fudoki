from collections import defaultdict
import re

FINANCIAL = ('当初予算額', '補正予算額', '繰越事業費繰越額', '予備費支出',
             '流用増減', '予算現額計', '支出済額', '翌年度繰越額', '不用額')
POSITION = ('原典物理頁', '原典xMin', '原典yMin', '原典xMax', '原典yMax')
BUSINESS = ('事業', '内訳1', '内訳2', '内訳3', '内訳4')


def current_year(columns):
    candidates = []
    for column in columns:
        match = re.fullmatch(r'施工概要_(令和|平成)\s*([0-9]+|元)\s*年度', column)
        if match:
            year = 1 if match[2] == '元' else int(match[2])
            candidates.append((year + (2018 if match[1] == '令和' else 1988), column))
    if not candidates:
        raise ValueError('施工概要に単年度の支出欄がない')
    return max(candidates)[1]


def prepare(records):
    groups = defaultdict(list)
    years = {c for row in records for c in row if c.startswith('施工概要_') and '年度' in c}
    current = current_year(years) if years else None
    for row in records:
        # 明細金額 repeats the deepest printed business amount. It has no
        # independent printed cell and must not become a second amount.
        amount = '内表_給付額' if row.get('内表_給付額') is not None else '内表_金額'
        if row.get(amount) is not None:
            row['内表_金額'] = row[amount]
            for k in POSITION:
                # A mapped 給付額 keeps its own printed cell position under the
                # adopted 金額 column; an unmapped 金額 already carries it.
                if amount != '内表_金額':
                    row['内表_金額_' + k] = row.get(amount + '_' + k)
            identity = tuple(row.get(amount + '_' + k) for k in POSITION)
            parent = tuple(row.get(p + '_' + k) for p in ('目', *BUSINESS) for k in POSITION[:3])
            groups[amount, parent, identity].append(row)
        if row.get('施工概要_区分') is not None:
            row['施工概要_名称'] = row['施工概要_区分']
            row['施工概要_金額'] = row.get(current)
            if '施工概要_計' in row:
                row['施工概要_施工概要／計'] = row['施工概要_計']
            for k in POSITION:
                # The row bounds stay the grain; the adopted amount columns
                # keep their own printed cell positions.
                row['施工概要_' + k] = row.get(k)
            if current is not None:
                for k in POSITION:
                    row['施工概要_金額_' + k] = row.get(current + '_' + k)
                    if '施工概要_計' in row:
                        row['施工概要_施工概要／計_' + k] = row.get('施工概要_計_' + k)
    for (amount, _, _), members in groups.items():
        fields = [c for c in members[0] if c.startswith('内表_') and c.count('_') == 1
                  and c not in ('内表_金額', '内表_給付額', '内表_月額', '内表_表題', '内表_名称')]
        labels = list(dict.fromkeys('／'.join(str(row[c]) for c in fields if row.get(c))
                                   for row in members))
        for row in members:
            row['内表_名称'] = '\n'.join(labels)
            for k in POSITION:
                row['内表_' + k] = row.get(amount + '_' + k)
    # Units are declared separately; a dash plus a detached 円 glyph is not
    # a compound monetary value. Keep the printed dash itself in amount_text.
    for row in records:
        for c, v in list(row.items()):
            if v == '－ 円':
                row[c] = '－'
    return records


def metadata(columns):
    contexts, money = [], []
    for level in ('款', '項', '目', *BUSINESS, '節'):
        group = [c for c in columns if c.startswith(level + '_')
                 and not c.startswith('目_機関部署見出し')]
        if not group:
            continue
        path = ['科目', level] if level in ('款', '項', '目') else ['節'] if level == '節' else ['事業説明']
        contexts.append({'columns': group, 'header_path': path,
                         'grain_columns': [level + '_' + k for k in POSITION[:3]]})
        money.extend(c for c in group if c == level + '_金額' or c in [level + '_' + f for f in FINANCIAL])
    if '内表_名称' in columns:
        group = [c for c in columns if c.startswith('内表_')]
        # Both 金額 and 給付額 are the printed additive amounts of this table.
        # The last printed heading is retained as the level for comparison.
        label = '給付額' if '内表_給付額' in columns else '金額'
        contexts.append({'columns': group, 'header_path': ['事業説明', label],
                         'grain_columns': ['内表_' + k for k in POSITION[:3]]})
        money.append('内表_金額')
    if '施工概要_名称' in columns:
        group = [c for c in columns if c.startswith('施工概要_')]
        years = [c for c in group if '年度' in c and c.rsplit('_', 1)[-1] not in POSITION]
        # The latest printed year is the current expenditure column. The raw
        # heading is kept; check_tree compares it via the printed level heading.
        current = current_year(years)
        contexts.append({'columns': group, 'header_path': ['事業説明', current.removeprefix('施工概要_')],
                         'grain_columns': ['施工概要_' + k for k in POSITION[:3]]})
        money.extend([c for c in years if c != current])
        money.append('施工概要_金額')
        if '施工概要_計' in columns:
            money.append('施工概要_施工概要／計')
    return {'units': [{'text': '円', 'scope': {'kind': 'columns', 'columns': money}}],
            'column_contexts': contexts,
            'notes': [{'text': '人数・件数・率・月額の基準および職員人数は金額の分解ではなく金額表に入れない。明細金額は最深の事業金額の反復であり二重計上しない。内表の縦結合金額は原典セルの位置で一度だけ数え、所属する印字区分の文字をまとめて保持する。', 'scope': {'kind': 'table'}}]}
