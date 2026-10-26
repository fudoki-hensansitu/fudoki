import json
import re
from ingestion.fiscal.layouts.statement.text_document import lines, AMOUNT
from ingestion.fiscal.manifest import validate_metadata


def controls(self, tokens):
    """Read the printed kan/kou totals by their three measured amount columns."""
    result, kan, account_total = {}, None, None
    for page in sorted({w.page for w in tokens}):
        for row in lines([w for w in tokens if w.page == page]):
            if not 98 <= row[0].bbox.top < 800:
                continue
            names = [w for w in row if w.bbox.left < 275]
            columns = [[w for w in row if left <= w.bbox.left < right]
                       for left, right in self.CONTROL_COLUMNS]
            if not names or not all(columns):
                continue
            text = ''.join(w.raw_text for w in names)
            amounts = [''.join(w.raw_text for w in cs) for cs in columns]
            if not all(AMOUNT.fullmatch(a) for a in amounts):
                continue
            if text == '歳出合計':
                account_total = amounts[0]
                continue
            match = re.fullmatch(r'(\d+)(.+)', text)
            if not match:
                raise ValueError(f'Unrecognized control: {text}')
            code, name = match.groups()
            prefix = '款_' if names[0].bbox.left < 140 else '項_'
            if prefix == '款_':
                kan = name
            key = (name,) if prefix == '款_' else (kan, name)
            if key in result:
                raise ValueError(f'Repeated control: {key}')
            result[key] = {'prefix': prefix, 'code': code, 'name': name, 'pos': self.position(names),
                           'parent': result.get((kan,)) if prefix == '項_' else None,
                           'amounts': [(label, text, self.position(words)) for label, text, words in zip(self.BUDGET, amounts, columns)]}
    if not account_total or not result:
        raise ValueError('Missing printed subject controls')
    return result, account_total


def assemble(self, tables, bindings, control_tokens):
    """Emit positioned cells; the common migrator alone constructs node keys."""
    subjects, account_total = self.rule('controls')(control_tokens)
    words = {w['token_id']: w for w in tables['words']}

    def cell(record, field):
        refs = json.loads(record['cell_token_ids']).get(field, [])
        ws = [words[ident] for ident in refs]
        if not ws:
            return None
        # A wrapped name can span pages; retain its first printed occurrence.
        first = [w for w in ws if w['page'] == ws[0]['page']]
        boxes = [json.loads(w['bbox']) for w in first]
        return dict(zip(self.POSITION, (first[0]['page'], min(b[0] for b in boxes), min(b[1] for b in boxes),
                                  max(b[2] for b in boxes), max(b[3] for b in boxes))))

    def node(prefix, record, name_field, parent, code=None):
        return {'prefix': prefix, 'code': code, 'name': record[name_field], 'pos': cell(record, name_field),
                'parent': parent, 'amounts': []}

    def amount(n, record, field, header):
        if record.get(field) is not None:
            n['amounts'].append((header, record[field], cell(record, field)))

    nodes = list(subjects.values())
    moku_by_id, explanation_by_id = {}, {}
    funding = ('national', 'loan', 'other', 'general')
    funding_labels = [bindings[k]['header_path'][-1] for k in funding]
    for m in tables['moku']:
        kan_name = re.fullmatch(r'第[０-９0-9]+款(.+)', m['kan_raw']).group(1)
        kou_name = re.fullmatch(r'第[０-９0-9]+項(.+)', m['kou_raw']).group(1)
        parent = subjects[(kan_name, kou_name)]
        refs = json.loads(m['cell_token_ids'])['moku_raw']
        code = m['code_raw']
        name = ''.join(words[r]['raw_text'] for r in refs if not (code is not None and words[r]['raw_text'] == code
                       and json.loads(words[r]['bbox'])[0] < 72))
        n = node('目_', m, 'moku_raw', parent, code)
        n['name'] = name
        for key, label in zip(('current', 'previous', 'difference'), self.BUDGET):
            amount(n, m, key + '_raw', label)
        for key in funding:
            amount(n, m, key + '_raw', bindings[key]['header_path'][-1])
        nodes.append(n); moku_by_id[m['row_id']] = n
    for e in tables['explanation']:
        parent = explanation_by_id[e['parent_id']] if e['parent_id'] else moku_by_id[e['moku_id']]
        n = node(f'説明{e["depth"] + 1}_', e, 'name_raw', parent)
        amount(n, e, 'amount_raw', '金額')
        nodes.append(n); explanation_by_id[e['row_id']] = n
    for s in tables['setsu']:
        n = node('節_', s, 'name_raw', moku_by_id[s['moku_id']], s['code_raw'])
        amount(n, s, 'amount_raw', '金額'); nodes.append(n)
    for f in tables['funding']:
        n = node('財源' + bindings[f['column_key']]['header_path'][-1] + '_', f, 'name_raw', moku_by_id[f['moku_id']])
        amount(n, f, 'amount_raw', '金額'); nodes.append(n)

    contexts, units, fields = [], [], []
    prefixes = list(dict.fromkeys(n['prefix'] for n in nodes))
    for prefix in prefixes:
        own = [n for n in nodes if n['prefix'] == prefix]
        amount_labels = list(dict.fromkeys(label for n in own for label, _, _ in n['amounts']))
        columns = [prefix + label for label in ('番号', '名称', *self.POSITION, '識別頁', '識別上端', '識別左端')]
        columns += [prefix + label for label in amount_labels if label not in funding_labels]
        fields.extend(columns)
        if prefix in ('款_', '項_', '目_'):
            path = ['科目', prefix[:-1]]
        elif prefix == '節_':
            path = bindings['setsu_code']['header_path']
        elif prefix.startswith('説明'):
            path = bindings['explanation_name']['header_path']
        else:
            path = next(bindings[k]['header_path'] for k in funding if prefix == '財源' + bindings[k]['header_path'][-1] + '_')
        contexts.append({'columns': columns, 'header_path': path, 'amount_position_prefix': prefix,
                         'grain_columns': [prefix + label for label in ('識別頁', '識別上端', '識別左端')]})
        for label in amount_labels:
            if prefix == '目_' and label in funding_labels:
                continue
            units.append({'text': bindings['current']['unit'], 'scope': {'kind': 'columns', 'columns': [prefix + label]}})
    for key in funding:
        label = bindings[key]['header_path'][-1]
        fields.append(label)
        contexts.append({'columns': [label], 'header_path': bindings[key]['header_path'][:-1], 'amount_position_prefix': '',
                         'grain_columns': ['目_識別頁', '目_識別上端', '目_識別左端']})
        units.append({'text': bindings[key]['unit'], 'scope': {'kind': 'columns', 'columns': [label]}})
    fields.extend(self.POSITION)

    def event(n, printed_amount=None):
        row = dict.fromkeys(fields)
        chain, cursor = [], n
        while cursor:
            chain.append(cursor); cursor = cursor['parent']
        for ancestor in reversed(chain):
            p, pos = ancestor['prefix'], ancestor['pos']
            row.update({p + '番号': ancestor['code'], p + '名称': ancestor['name'],
                        p + '識別頁': pos['物理頁'], p + '識別上端': pos['上端'], p + '識別左端': pos['左端'],
                        **{p + k: v for k, v in pos.items()}})
        if printed_amount:
            label, text, pos = printed_amount
            if n['prefix'] == '目_' and label in funding_labels:
                row[label] = text; row.update(pos)
            else:
                row[n['prefix'] + label] = text
                row.update({n['prefix'] + k: v for k, v in pos.items()})
        return row

    # First emit names, so later amount cells keep their own page and rectangle
    # without replacing the node's printed name position.
    rows = [event(n) for n in nodes]
    rows.extend(event(n, a) for n in nodes for a in n['amounts'])
    metadata = {'column_contexts': contexts, 'units': units, 'notes': [{'text':
                '科目、説明、節の区分、財源内訳は独立した印字欄。空欄を0に置換しない。', 'scope': {'kind': 'table'}}]}
    validate_metadata(metadata, fields)
    return rows, metadata, account_total

FUNCTIONS = {
    'assemble': assemble,
    'controls': controls,
}
