"""Keep printed monetary annotations on a separate, non-additive axis."""
from collections import defaultdict
from bisect import bisect_right
import csv
import hashlib
import json
from pathlib import Path
import re
import unicodedata

from shared.amount import number
from ingestion.lib.node_tables import NodeTables, _coverage_word, _exclusion_hit, _position, _contains, _word_key

DICTIONARY = Path(__file__).resolve().parents[2] / 'shared/fiscal_annotation_map.csv'


def annotation_dictionary():
    with DICTIONARY.open() as stream:
        return sorted(csv.DictReader(stream), key=lambda row: len(row['keyword']), reverse=True)


def _union(words):
    return [min(w[1][0] for w in words), min(w[1][1] for w in words),
            max(w[1][2] for w in words), max(w[1][3] for w in words)]


def _text(words):
    parts = []
    for index, (_, box, text) in enumerate(words):
        if index and box[0] - words[index - 1][1][2] > 2:
            parts.append(' ')
        parts.append(text)
    return ''.join(parts)


def add_annotations(tables, scope, *, raw_rows=(), adopted=None):
    """Extract amount cells following annotation headings, retaining their owner.

    A continuation inherits a heading only in the same printed column. Existing
    adopted prints and observation-only regions never become new annotations.
    """
    by_key = {n['node_key']: n for n in tables.nodes}
    def subject(key):
        while key is not None:
            node = by_key[key]
            if node['level_header'] in ('目', '項', '款'):
                return key
            key = node['parent_node_key']
        return None
    dictionary = annotation_dictionary()
    remark_dictionary = [r for r in dictionary if r['keyword'] not in ('月額', '1回…円')]
    scope_dictionary = [r for r in remark_dictionary if r['keyword'] != '事業へ支出']
    contexts = defaultdict(list)
    reserve_destinations = []
    def reserve_kind(owner, text, references=()):
        # Both destination forms require a measured remark owned by the exact
        # reserve subject. The abbreviated form also needs a printed counterpart.
        if _word_key(by_key[owner]['name_text'] or '') != '予備費':
            return None
        compact = _word_key(text)
        if '事業へ支出' in compact:
            return next((r['kind'] for r in remark_dictionary if r['keyword'] == '事業へ支出'), None)
        destination = re.sub(r'[△▲-]?[0-9][0-9,]*$', '', compact)
        if destination.endswith('へ') and any(kind == '充用' and other != owner
                and (name := _word_key(by_key[other]['name_text'] or '')) and name in destination
                for other, _, kind in references):
            return '充用'
        return None
    index = {(n['level_header'], n['code_text'], n['physical_page'], n['y0']): n['node_key']
             for n in tables.nodes if n['level_header'] in ('款', '項', '目')}
    for row in raw_rows:
        for column, text in row.items():
            if not column.endswith('_備考') or not text:
                continue
            prefix = column.removesuffix('備考')
            pos = _position(row, prefix)
            owner = index.get((prefix[:-1], row.get(prefix + '番号'), pos['physical_page'], pos['y0']))
            if owner is None:
                continue
            inherited_kind = None
            pending_label = []
            for line in str(text).splitlines():
                compact = _word_key(line)
                heading = _word_key(''.join([*pending_label, line]))
                preserved = '\n'.join([*pending_label, line])
                kind = next((r['kind'] for r in scope_dictionary if r['keyword'] in heading),
                            reserve_kind(owner, preserved) or inherited_kind)
                if kind is None:
                    match = re.search(r'へ([△▲-]?[0-9][0-9,]*)$', heading)
                    if match:
                        reserve_destinations.append((owner, preserved, number(match[1])))
                    pending_label.append(line)
                    continue
                inherited_kind = kind
                preserved = '\n'.join([*pending_label, line])
                found_amount = False
                for match in re.finditer(r'[△▲-]?[0-9][0-9,]*', compact):
                    if (compact[:match.start()].endswith(('第', '.'))
                            or compact[match.end():].startswith(('.', '節', '款', '項', '目', '年', '号', '回', '人', '件', '名', '日', '歳'))):
                        continue
                    value = number(match[0])
                    if value is not None:
                        found_amount = True
                        item = (owner, preserved, kind)
                        if item not in contexts[value]:
                            contexts[value].append(item)
                pending_label = [] if found_amount else [*pending_label, line]
    # Only explicit annotations from this original may verify a reserve's
    # abbreviated destination note; never use the new destination notes as proof.
    explicit_contexts = {value: [item for item in items if any(
        r['kind'] == '充用' and r['keyword'] in _word_key(item[1]) for r in scope_dictionary)]
        for value, items in contexts.items()}
    for owner, text, value in reserve_destinations:
        kind = reserve_kind(owner, text, explicit_contexts.get(value, ()))
        item = (owner, text, kind)
        if kind is not None and item not in contexts[value]:
            contexts[value].append(item)
    positioned = defaultdict(list)
    for amount in (adopted or tables).amounts:
        if amount['physical_page'] is not None:
            positioned[amount['physical_page']].append(amount)
    label_nodes = defaultdict(list)
    for node in (adopted or tables).nodes:
        if node['physical_page'] is not None:
            label_nodes[node['physical_page']].append(node)
    owners = sorted((a['physical_page'], a['y0'], subject(a['node_key']), a['unit_text'])
                    for a in tables.amounts if a['physical_page'] is not None
                    and a['y0'] is not None and subject(a['node_key']) is not None)
    owner_positions = [(p, y) for p, y, _, _ in owners]
    subject_nodes = defaultdict(list)
    for n in tables.nodes:
        if n['level_header'] in ('款', '項', '目') and n['physical_page'] is not None:
            subject_nodes[n['level_header']].append(n)
    def active_owner(key, page, y):
        level = by_key[key]['level_header']
        active = [n for n in subject_nodes[level] if (n['physical_page'], n['y0']) <= (page, y + 2)]
        return active and max(active, key=lambda n: (n['physical_page'], n['y0']))['node_key'] == key
    excluded = defaultdict(list)
    for entry in scope.get('excluded_regions', ()):
        pages = [entry['page']] if 'bbox' in entry else [
            p for first, last in entry['pages'] for p in range(first, last + 1)]
        for p in pages:
            excluded[p].append(entry)
    lines = {}
    for word in sorted(map(_coverage_word, scope['words']), key=lambda w: (w[0], w[1][1], w[1][0])):
        if not lines or word[0] != anchor[0] or word[1][1] - anchor[1] > 2:
            anchor = (word[0], word[1][1])
            lines[anchor] = []
        lines[anchor].append(word)
    anchors = defaultdict(set)
    for line in lines.values():
        line = sorted(line, key=lambda w: w[1][0])
        compact = unicodedata.normalize('NFKC', ''.join(w[2] for w in line))
        kind = next((r['kind'] for r in scope_dictionary if r['keyword'] in compact), None)
        if kind is not None:
            label_edge = max((w[1][2] for w in line if not re.fullmatch(
                r'[△▲\-0-9,()]+', unicodedata.normalize('NFKC', w[2]))), default=0)
            for w in line:
                if w[1][0] >= label_edge and number(w[2].strip('()（）')) is not None:
                    anchors[kind].add(w[1][2])
    nodes, amounts = list(tables.nodes), list(tables.amounts)
    headings = {}
    label_only = []
    for (page, y), words in sorted(lines.items()):
        words.sort(key=lambda w: w[1][0])
        words = [w for w in words if _exclusion_hit(
            {'page': page, 'bbox': w[1]}, excluded[page], .5) is None]
        if not words:
            continue
        label_start = next((i for i, w in enumerate(words) if any(
            r['keyword'] in unicodedata.normalize('NFKC', ''.join(v[2] for v in words[i:]))
            and not r['keyword'] in unicodedata.normalize('NFKC', ''.join(v[2] for v in words[i + 1:]))
            for r in scope_dictionary)), None)
        kind = next((r['kind'] for r in scope_dictionary if r['keyword'] in
                     unicodedata.normalize('NFKC', ''.join(w[2] for w in words))), None)
        # The complete monetary cell can consist of individual Poppler glyphs.
        parts = []
        for w in words:
            key = unicodedata.normalize('NFKC', w[2])
            if re.fullmatch(r'[△▲\-0-9,()]+', key):
                if parts and w[1][0] - parts[-1][-1][1][2] <= 12:
                    parts[-1].append(w)
                else:
                    parts.append([w])
        if label_start is not None and not any(cell[0][1][0] > words[label_start][1][2] for cell in parts):
            caption = words[label_start:]
            label_only.append({'page':page, 'y':y, 'box':_union(caption), 'words':caption, 'kind':kind})
        if label_start is not None:
            preceding = [w for cell in parts for w in cell
                         if w[1][2] <= words[label_start][1][0]
                         and not any(v[1][2] <= cell[0][1][0] and cell[0][1][0] - v[1][2] <= 12
                                     and unicodedata.normalize('NFKC', v[2]).endswith('第') for v in words)]
            left = max((w[1][2] for w in preceding), default=words[0][1][0])
            label = [w for w in words if w[1][0] >= left - .1]
        else:
            label = []
        for cell in parts:
            value = ''.join(w[2] for w in cell)
            if number(value) is None:
                value = value.strip('()（）')
            if number(value) is None:
                continue
            box = _union(cell)
            if any(_contains((a['x0'], a['y0'], a['x1'], a['y1']), box, .5)
                   or (a['x0'] - .5 <= (box[0] + box[2]) / 2 <= a['x1'] + .5
                       and abs(a['y0'] - box[1]) <= 2) for a in positioned[page]):
                continue
            if any(n['physical_page'] == page and n['x0'] is not None
                   and _contains((n['x0'], n['y0'], n['x1'], n['y1']), box, .5)
                   and _word_key(value) in (_word_key(n.get('code_text') or ''), _word_key(n.get('name_text') or ''))
                   for n in label_nodes[page]):
                continue
            names = [w for w in label if w[1][2] <= box[0] + .5]
            preceding_money = [c for c in parts if c[-1][1][2] < box[0]
                               and (',' in ''.join(w[2] for w in c) or len(_word_key(''.join(w[2] for w in c))) >= 4)]
            if preceding_money:
                left = max(c[-1][1][2] for c in preceding_money)
                names = [w for w in names if w[1][0] >= left]
            caption = unicodedata.normalize('NFKC', _text(names))
            matches = [(m.end(), len(r['keyword']), r['kind']) for r in scope_dictionary
                       for m in re.finditer(re.escape(r['keyword']), caption)]
            if matches:
                kind = max(matches)[2]
            candidates = contexts.get(number(value), [])
            if candidates:
                candidates = [c for c in candidates if by_key[c[0]]['physical_page'] is not None
                              and active_owner(c[0], page, box[1])]
            printed_label = _word_key(_text(names))
            def context_match(item):
                compact = _word_key(item[1])
                prefix = re.sub(r'[△▲-]?[0-9][0-9,]*[)）]?$','',compact)
                return len(prefix) if prefix and prefix in printed_label else 0
            context = max(candidates, key=lambda c: (context_match(c), by_key[c[0]]['physical_page'], by_key[c[0]]['y0'])) if candidates else None
            inherited = None
            if not names:
                inherited = next((h for (p, right), h in headings.items()
                                  if p == page and abs(right - box[2]) <= 3
                                  and h['y'] < y and not any(
                                      w[1][0] >= h['left'] - .5 and w not in cell
                                      and not re.fullmatch(r'[△▲\-0-9,()]+', unicodedata.normalize('NFKC', w[2]))
                                      for w in words)), None)
                if inherited is None and context is None:
                    above = [h for h in label_only if h['page'] == page
                             and 0 < box[1] - h['box'][1] <= 2 * (h['box'][3] - h['box'][1])
                             and h['box'][0] <= box[0] <= h['box'][2] + 5 * (h['box'][3] - h['box'][1])]
                    if above:
                        h = max(above, key=lambda h:h['y'])
                        inherited = {**h, 'left':h['box'][0], 'parent':owners[bisect_right(owner_positions, (page, box[1] + 2)) - 1][2]}
                if inherited is None and context is None:
                    continue
                if inherited is not None:
                    names, kind = inherited['words'], inherited['kind']
                elif not names:
                    names = [w for w in words if w[1][2] <= box[0] + .5 and w not in sum(parts, [])]
                    kind = context[2]
            elif box[0] < names[0][1][0]:
                continue
            owner_index = bisect_right(owner_positions, (page, box[1] + 2)) - 1
            if owner_index < 0:
                continue
            _, _, parent, unit = owners[owner_index]
            if context is not None:
                parent, raw_context, kind = context
                if (not re.search(r'[^0-9,△▲\s()-]', raw_context) and inherited is None
                        and not any(abs(right - box[2]) <= 3 for right in anchors[kind])):
                    continue
            elif inherited and inherited['parent'] != parent:
                continue
            # Keep the original heading, including transfer-from/to section numbers.
            raw_label = raw_context if context is not None else _text(names)
            key = 'a-' + hashlib.sha256(json.dumps([parent, page, box, raw_label], ensure_ascii=False).encode()).hexdigest()[:24]
            label_box = _union(names) if names else box
            nodes.append({'node_key': key, 'parent_node_key': parent, 'axis_header': '注記',
                          'depth': 1, 'level_header': kind, 'code_text': None, 'name_text': raw_label,
                          'physical_page': names[0][0] if names else page, **dict(zip(('x0','y0','x1','y1'), label_box))})
            amounts.append({'node_key': key, 'header_path': '注記金額', 'amount_text': value,
                            'unit_text': unit, 'physical_page': page,
                            **dict(zip(('x0','y0','x1','y1'), box))})
            headings[page, box[2]] = {'words': names, 'kind': kind, 'parent': parent,
                                     'left': names[0][1][0] if names else box[0], 'y': y}
    # Rate annotations require a typed monetary cell or an explicit
    # parenthetical amount with 円. A generic count such as 1回 is not money.
    rate_kind = {r['keyword']: r['kind'] for r in dictionary}
    rates = []
    if '月額' in rate_kind:
        for row in raw_rows:
            rate_parent = None
            for prefix in ('目_', '項_', '款_'):
                pos = _position(row, prefix)
                rate_parent = index.get((prefix[:-1], row.get(prefix + '番号'), pos['physical_page'], pos['y0']))
                if rate_parent is not None:
                    break
            value = row.get('内表_月額')
            pos = _position(row, '内表_月額_')
            if rate_parent is None or value is None or None in pos.values():
                continue
            cell = [pos[k] for k in ('x0','y0','x1','y1')]
            prefix = re.split(r'[(（](?=令和|平成|昭和)', str(value))[0]
            compact = re.sub(r'\s+', '', prefix).replace('円','')
            if not re.fullmatch(r'[0-9][0-9,]*(?:[～〜][0-9][0-9,]*)?', compact):
                continue
            for value in re.split('[～〜]', compact):
                printed = [w for line in lines.values() for w in line
                           if w[0] == pos['physical_page'] and _contains(cell, w[1], .5)
                           and number(_word_key(w[2]).removesuffix('円')) == number(value)]
                for word in printed:
                    rates.append((pos['physical_page'], word[1], value,
                                  '月額 ' + str(row['内表_月額']), rate_kind['月額'], rate_parent))
    if '1回…円' in rate_kind:
        for (page, y), line in lines.items():
            line = sorted(line, key=lambda w: w[1][0])
            compact, spans = '', []
            for word in line:
                text = _word_key(word[2])
                spans.append((len(compact), len(compact) + len(text), word))
                compact += text
            for match in re.finditer(r'[（(]1回([0-9][0-9,]*)円[^()（）]*[)）]', compact):
                cash = [word for start, end, word in spans
                        if start < match.end(1) and match.start(1) < end]
                # All amount glyphs must be independent of the count's glyph.
                if ''.join(_word_key(w[2]) for w in cash) != match[1]:
                    continue
                box = _union(cash)
                label_owners = [n for n in label_nodes[page] if n['node_key'] in by_key
                                and n['x0'] is not None and n['name_text']
                                and _contains((n['x0'],n['y0'],n['x1'],n['y1']), box, .5)
                                and match[1] in _word_key(n['name_text'])]
                if not label_owners:
                    continue
                label_owner = min(label_owners, key=lambda n:(n['x1']-n['x0'])*(n['y1']-n['y0']))
                parent = subject(label_owner['node_key'])
                if parent is not None:
                    rates.append((page, box, match[1], match[0], rate_kind['1回…円'], parent))
    seen_rates = set()
    for page, box, value, label, kind, parent in rates:
        identity = (page, *box, value)
        if identity in seen_rates or _exclusion_hit({'page':page, 'bbox':box}, excluded[page], .5) is not None:
            continue
        seen_rates.add(identity)
        if any(number(a['amount_text']) == number(value)
               and _contains((a['x0'],a['y0'],a['x1'],a['y1']), box, .5) for a in positioned[page]):
            continue
        key = 'a-' + hashlib.sha256(json.dumps([parent, page, box, label], ensure_ascii=False).encode()).hexdigest()[:24]
        nodes.append({'node_key':key, 'parent_node_key':parent, 'axis_header':'注記', 'depth':1,
                      'level_header':kind, 'code_text':None, 'name_text':label, 'physical_page':page,
                      **dict(zip(('x0','y0','x1','y1'),box))})
        amounts.append({'node_key':key, 'header_path':'注記金額', 'amount_text':value, 'unit_text':'円',
                        'physical_page':page, **dict(zip(('x0','y0','x1','y1'),box))})
    return NodeTables(nodes, amounts, tables.unread_amount_count, tables.unresolved_parent_count, tables.issues)
