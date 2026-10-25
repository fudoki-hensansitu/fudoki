from __future__ import annotations
from dataclasses import replace
import re
from ingestion.lib.pdf_table import Box, Column


def detail(self, pdf, pages, origin, directory):
    output, observations = [], []
    coverage = []
    context, positions = {}, {}
    for index, page in enumerate(pages):
        tokens, rules = self.observe(pdf, page, origin, directory)
        coverage.extend((page, (t.bbox.left, t.bbox.top, t.bbox.right, t.bbox.bottom), t.raw_text)
                        for t in tokens)
        if self.text([t for t in tokens if '消費税' in t.raw_text]) != '（消費税抜き）':
            raise ValueError('Expense detail tax heading differs')
        header = [t for t in tokens if 90 < t.bbox.top < 145 and t.raw_text in ('款項', '目', '節', '金', '額（円）', '備', '考')]
        if set(t.raw_text for t in header) != {'款項', '目', '節', '金', '額（円）', '備', '考'}:
            raise ValueError('Missing expense detail headers')
        offset = next(t.bbox.left for t in tokens if t.raw_text == '額（円）') - 302.302121
        border = 177.4 + offset
        split = []
        for token in tokens:
            if token.bbox.left < border < token.bbox.right and token.bbox.top > 115:
                # Poppler merges the final moku glyph with the first section glyph
                # on continuation pages. Split only this two-glyph boundary case.
                if len(token.raw_text) != 2 or token.raw_text[0] != '費':
                    raise ValueError(f'Unmeasured word crossing name/section rule: {token.id}')
                width = token.bbox.bottom - token.bbox.top
                split.extend((replace(token, id=token.id + ':left', raw_text=token.raw_text[0],
                                      bbox=Box(token.bbox.left, token.bbox.top, token.bbox.left + width, token.bbox.bottom), parent_id=token.id),
                              replace(token, id=token.id + ':right', raw_text=token.raw_text[1],
                                      bbox=Box(token.bbox.right - width, token.bbox.top, token.bbox.right, token.bbox.bottom), parent_id=token.id)))
            else:
                split.append(token)
        tokens = split
        bands = self.bands_at(rules, 300 + offset, 140 if index == 0 else 110, 795)
        columns = [Column('名称', 50, border, anchor='left'), Column('節', border, 260.1 + offset, anchor='left'),
                   Column('金額（円）', 260.1 + offset, 343 + offset, anchor='left'), Column('備考', 343 + offset, 550, anchor='left')]
        for record in self.cells(tokens, page, columns, bands):
            label, section, amount = record['名称'], record['節'], record['金額（円）']
            if label:
                names = record['_tokens']['名称']
                numbering = [t for t in names if t.bbox.left < 95 + offset and re.fullmatch('[０-９]+', t.raw_text)]
                if numbering:
                    label = (self.text(numbering) or '') + (self.text([t for t in names if t not in numbering]) or '')
            if amount is None or not self.AMOUNT.fullmatch(amount):
                raise ValueError(f'Missing/unrecognized detail amount on p{page}: {record}')
            band = record['_band']
            if label and not section:
                left = min(t.bbox.left for t in record['_tokens']['名称']) - offset
                level = '款' if left < 62 else '項' if left < 76 else '目'
                lower = ('款', '項', '目')
                for key in lower[lower.index(level):]:
                    context.pop(key, None)
                    context.pop(key + '_金額', None)
                    positions.pop(key, None)
                context.update({level: label, level + '_金額': amount})
                positions[level] = self.printed_position(page, record['_tokens']['名称'] + record['_tokens']['金額（円）'])
                observations.append({'page': page, 'kind': level, 'name': label, 'amount': amount, 'top': band.top, 'bottom': band.bottom})
                continue
            if not section or not all(key in context for key in ('款', '項', '目')):
                raise ValueError(f'Expense section lacks full source hierarchy on p{page}')
            if label and label != context['目']:
                raise ValueError(f'Continuation moku differs on p{page}: {label}')
            remarks = record['_tokens']['備考']
            remark_lines = []
            for t in sorted(remarks, key=lambda t: (t.bbox.top, t.bbox.left)):
                if not remark_lines or t.bbox.top - remark_lines[-1][0].bbox.top > 1:
                    remark_lines.append([])
                remark_lines[-1].append(t)
            budget, budget_position, leaves, leaf_positions = None, None, [], []
            for line in remark_lines:
                amounts = [t for t in line if self.AMOUNT.fullmatch(t.raw_text)]
                names = [t for t in line if t not in amounts]
                if len(amounts) != 1 or not names:
                    raise ValueError(f'Unmeasured expense remark line on p{page}')
                name, value = self.text(names), self.text(amounts)
                if name == '予算額':
                    if budget is not None:
                        raise ValueError('Repeated remark budget')
                    budget = value
                    budget_position = self.printed_position(page, line)
                else:
                    leaves.append((name, value))
                    leaf_positions.append(self.printed_position(page, line))
            observations.append({'page': page, 'kind': '節', 'name': section, 'amount': amount,
                                 'context': dict(context), 'budget': budget, 'remarks': leaves,
                                 'top': band.top, 'bottom': band.bottom})
            section_position = self.printed_position(page, record['_tokens']['節'] + record['_tokens']['金額（円）'])
            for (name, value), leaf_position in zip(leaves or [(None, None)], leaf_positions or [None], strict=True):
                output.append({**context, '節': section, '金額（円）': amount, '備考_予算額': budget,
                               '備考_名称': name, '備考_金額': value,
                               **self.position(page, self.printed_page(tokens), band),
                               '_positions': {**positions, '節': section_position,
                                              '備考': leaf_position, '予算額': budget_position}})
    return output, observations, coverage


def migration_detail_rows(self, rows):
    """Declare the printed hierarchy for the common node-table migration.

    Enterprise sections are children of moku, and their remarks are children of
    the section. Budget annotations belong to that section rather than to a
    remark leaf. Position grains distinguish printed items with equal names.
    The internal 科目 prefixes also keep independent revenue/capital statements
    out of the manager's 款_/項_/目_ sibling-completion path.
    """
    output = []
    for row in rows:
        record = {}
        for level in ('款', '項', '目', '節'):
            prefix = '科目' + level + '_'
            record[prefix + '名称'] = row[level]
            record[prefix + '金額（円）'] = row['金額（円）' if level == '節' else level + '_金額']
            record.update({prefix + k: v for k, v in row['_positions'][level].items()})
        record.update({'備考_名称': row['備考_名称'], '備考_金額（円）': row['備考_金額'],
                       '備考_予算額': row['備考_予算額']})
        for key in ('物理頁', '左端', '上端', '右端', '下端'):
            record['備考_' + key] = (row['_positions']['備考'] or {}).get(key)
            record[key] = (row['_positions']['予算額'] or {}).get(key)
        output.append(record)
    return output


def detail_metadata(self):
    amounts, contexts = [], []
    for level in ('款', '項', '目', '節'):
        prefix = '科目' + level + '_'
        amount = prefix + '金額（円）'
        positions = [prefix + k for k in ('物理頁', '左端', '上端', '右端', '下端')]
        amounts.append(amount)
        contexts.append({'columns': [prefix + '名称', amount, *positions],
                         'header_path': ['款項', level], 'grain_columns': positions, 'amount_position_prefix': prefix})
    amounts += ['備考_金額（円）', '備考_予算額']
    contexts += [
        {'columns': ['備考_名称', '備考_金額（円）'], 'header_path': ['備考'], 'amount_position_prefix': '備考_',
         'grain_columns': ['備考_物理頁', '備考_上端', '備考_左端']},
        {'columns': ['備考_予算額'], 'header_path': ['備考'], 'amount_position_prefix': '',
         'grain_columns': ['科目節_物理頁', '科目節_上端', '科目節_左端']},
    ]
    note = ('（消費税抜き）。款項・目・節の金額（円）は決算の実績。'
            '備考の予算額は同じ節の別金額欄、その他の備考金額は同じ節の実績内訳。'
            '企業会計の節は原典のまま保持する。収益的支出と資本的支出は独立した表。')
    return {'units': [{'text': '円', 'scope': {'kind': 'columns', 'columns': amounts}}],
            'notes': [{'text': note, 'scope': {'kind': 'table'}}], 'column_contexts': contexts}

FUNCTIONS = {
    'detail': detail,
    'detail_metadata': detail_metadata,
    'migration_detail_rows': migration_detail_rows,
}
