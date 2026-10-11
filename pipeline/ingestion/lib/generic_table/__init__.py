"""Experimental text-table engine: geometry declarations, no jurisdiction dispatch.

Printed words are the only extraction input. Reference tables belong exclusively
in the evaluator. A failed or ambiguous candidate is inspectable, never publishable.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
import re
import subprocess

from ingestion.lib.pdf_table import Box, Token, tokens_from_bbox_layout
from ingestion.lib.node_tables import NodeTables, check_tree, number

NUMBER_PART = re.compile(r'[△\-0-9,]+')
GLUED = re.compile(r'(?P<first>[0-9][0-9,]*)(?P<second>△[0-9][0-9,]*)')
CODE = re.compile(r'(?P<code>\(?[0-9]+\)?|[①-⑳]|[ア-ン][）)])(?P<rest>.*)')

def split_glued(tokens):
    """Split one word printed across two amount cells (`0△181,846,590`).

    A sign right after a digit cannot start inside one amount, so the word is
    two prints; boxes are apportioned by character count.
    """
    result = []
    for token in tokens:
        match = GLUED.fullmatch(token.raw_text) if token.bbox else None
        if not match:
            result.append(token)
            continue
        box, cut = token.bbox, len(match['first'])/len(token.raw_text)
        middle = box.left + (box.right-box.left)*cut
        result += [Token(token.id+'a', token.origin_id, token.page, match['first'], Box(box.left, box.top, middle, box.bottom)),
                   Token(token.id+'b', token.origin_id, token.page, match['second'], Box(middle, box.top, box.right, box.bottom))]
    return tuple(result)


@dataclass
class Result:
    tables: NodeTables
    check: dict
    candidates: list[dict]
    diagnostics: dict
    accepted: bool  # Unique checked candidate in this family, NOT completeness.


def observe(pdf: Path, pages: list[list[int]], origin_id: str) -> tuple[Token, ...]:
    result = []
    for first, last in pages:
        xml = subprocess.check_output(['pdftotext', '-cropbox', '-f', str(first), '-l', str(last),
                                       '-bbox-layout', str(pdf), '-'])
        result.extend(tokens_from_bbox_layout(xml, origin_id=origin_id, first_page=first))
    return tuple(result)


def lines(words, tolerance=1):
    groups = []
    for word in sorted(words, key=lambda w: (w.bbox.top, w.bbox.left)):
        if not groups or word.bbox.top - groups[-1][0].bbox.top > tolerance:
            groups.append([])
        groups[-1].append(word)
    return [sorted(row, key=lambda w: w.bbox.left) for row in groups]


def text(words, separator='gap'):
    parts = []
    for row in lines(words):
        value = ''
        previous = None
        for word in row:
            if previous and (separator == 'space' or word.bbox.left - previous.bbox.right > 1):
                value += ' '
            value += word.raw_text
            previous = word
        parts.append(value)
    return '\n'.join(parts) or None


def select(words, left, right, top=-float('inf'), bottom=float('inf')):
    return [w for w in words if left <= w.bbox.x('center') < right and top <= w.bbox.top < bottom]


def position(words):
    if not words:
        return dict.fromkeys(('physical_page', 'x0', 'y0', 'x1', 'y1'))
    pages = {w.page for w in words}
    if len(pages) != 1:
        raise ValueError('A printed cell cannot span physical pages')
    return dict(physical_page=words[0].page, x0=min(w.bbox.left for w in words),
                y0=min(w.bbox.top for w in words), x1=max(w.bbox.right for w in words),
                y1=max(w.bbox.bottom for w in words))


def numeric_cell(words, left, right, y, tolerance=1):
    values = select(words, left, right, y-tolerance, y+tolerance)
    values = [w for w in values if w.bbox.left >= left or NUMBER_PART.fullmatch(w.raw_text)]
    if not values or any(not NUMBER_PART.fullmatch(w.raw_text) for w in values):
        return None
    value = ''.join(w.raw_text for w in sorted(values, key=lambda w: w.bbox.left))
    # Detached signs may be printed immediately above their financial baseline.
    signs = select(words, left, right, y-12, y-tolerance)
    signs = [w for w in signs if w.raw_text == '△']
    if len(signs) == 1 and not value.startswith('△'):
        value = '△' + value
        values = [*values, signs[0]]
    if number(value) is None:
        return None
    return value, position(values)


def cluster_positions(values, gap):
    groups = []
    for value in sorted(values):
        if not groups or value - groups[-1][-1] > gap:
            groups.append([])
        groups[-1].append(value)
    return [sum(g)/len(g) for g in groups]


def discover_numeric_columns(words, bounds, *, minimum_rows=3, tolerance=2):
    """Return recurring right-alignment centers as geometry hints, not fiscal roles.

    Adjacent Poppler fragments are joined before counting alignments. A broad
    region containing quantities or another axis will produce extra clusters;
    callers must not silently interpret the first N clusters as N budget columns.
    """
    observations = []
    per_page = defaultdict(list)
    for word in select(words,*bounds):
        per_page[word.page].append(word)
    rows = [row for page in per_page.values() for row in lines(page)]
    for row in rows:
        chunks = []
        for word in row:
            if not NUMBER_PART.fullmatch(word.raw_text):
                continue
            if not chunks or word.bbox.left-chunks[-1][-1].bbox.right > 2:
                chunks.append([])
            chunks[-1].append(word)
        for chunk in chunks:
            raw = ''.join(w.raw_text for w in chunk)
            if number(raw) is not None:
                observations.append(max(w.bbox.right for w in chunk))
    centers = cluster_positions(observations,tolerance)
    return [dict(right_edge=center,observations=sum(abs(x-center)<=tolerance for x in observations))
            for center in centers if sum(abs(x-center)<=tolerance for x in observations)>=minimum_rows]


def ci_valid(channel, code):
    return not channel.get('code_pattern') or re.fullmatch(channel['code_pattern'], code)


def extract(tokens: tuple[Token, ...], config: dict) -> Result:
    """Extract one declared table, trying alternative indentation/number evidence.

    Currency is checked for presence; header meanings remain declaration hints. Each channel declares
    its label band and amount bands; channels share y on a spread but retain pages.
    No sums are used to synthesize missing text or amounts.
    """
    tokens = split_glued(tokens)
    page_words = defaultdict(list)
    for word in tokens:
        page_words[word.page].append(word)
    channels = config['channels']
    tolerance = config.get('row_tolerance', 1)
    separator = config.get('separator', 'gap')
    diagnostics = Counter()
    geometry = []
    observations = []
    excluded_labels = set()
    pages = sorted(page_words)
    stride = 2 if config.get('spread') else 1
    for index in range(0, len(pages), stride):
        pair = pages[index:index+stride]
        if len(pair) != stride:
            raise ValueError('Incomplete declared spread')
        for channel_index, channel in enumerate(channels):
            words = page_words[pair[channel.get('page_offset', 0)]]
            lo, hi = channel['label']
            top, bottom = config['body']
            body = [w for w in words if top <= w.bbox.top < bottom]
            columns = channel['amounts']
            label_rows = lines([w for w in body if lo <= w.bbox.left < hi], tolerance)
            for row_index, row in enumerate(label_rows):
                columns = channel['amounts']
                first = row[0]
                # Poppler can split a printed two-digit code into adjacent words.
                code_words = [first]
                if re.fullmatch('[0-9]+', first.raw_text):
                    for word in row[1:]:
                        if re.fullmatch('[0-9]+',word.raw_text) and word.bbox.left-code_words[-1].bbox.right <= 1:
                            code_words.append(word)
                        else:
                            break
                if len(code_words)>1:
                    first = Token(first.id,first.origin_id,first.page,
                                  ''.join(w.raw_text for w in code_words),
                                  Box(first.bbox.left,first.bbox.top,code_words[-1].bbox.right,
                                      max(w.bbox.bottom for w in code_words)))
                match = CODE.fullmatch(first.raw_text)
                y = first.bbox.top
                cells = [numeric_cell(body, a, b, y, tolerance) for a,b,_ in columns]
                if not any(cells) and match and ci_valid(channel, match['code']):
                    # Wrapped labels sometimes put the amount on their final line.
                    next_marker = min([later[0].bbox.top for later in label_rows[row_index+1:]
                                       if CODE.fullmatch(later[0].raw_text)] + [y+30])
                    for later in lines(body, tolerance):
                        later_y = later[0].bbox.top
                        if y+tolerance < later_y < min(next_marker, y+30):
                            trial = [numeric_cell(body,a,b,later_y,tolerance) for a,b,_ in columns]
                            if any(trial):
                                cells = trial
                                break
                if not any(cells):
                    continue
                if channel_index == 0 and not match:
                    diagnostics['aggregate_or_unmarked_principal'] += 1
                    excluded_labels.update(w.id for w in row)
                    continue
                if not match and re.search(r'^第.*(?:流用|充用)', text(row) or ''):
                    diagnostics['transfer_annotation'] += 1
                    excluded_labels.update(w.id for w in row)
                    continue
                continuation = not match and any(
                    o['channel']==channel_index and o['page']==first.page and
                    any(abs(a['y0']-y)<tolerance for a in o['amounts']) for o in observations)
                if continuation:
                    continue
                if channel.get('code_pattern') and (not match or not re.fullmatch(channel['code_pattern'], match['code'])):
                    diagnostics['annotation_or_quantity'] += 1
                    excluded_labels.update(w.id for w in row)
                    continue
                if match:
                    code = match['code']
                    label = list(row[len(code_words):])
                    if match['rest']:
                        # Keep the whole-word box; do not fabricate character geometry.
                        label.insert(0, Token(first.id, first.origin_id, first.page, match['rest'], first.bbox))
                else:
                    code, label = None, list(row)
                # A quantity with a unit is never a currency amount just because numeric.
                if re.search(r'[0-9].*(?:人|件|台|回|日|㎡|m2)', text(label) or ''):
                    diagnostics['possible_quantity_label'] += 1
                amounts = []
                paired_columns = channel.get('paired_amounts', [])
                if paired_columns:
                    other_words = page_words[pair[1]]
                    columns = [*columns, *paired_columns]
                    cells = [*cells, *(numeric_cell(other_words,a,b,y,tolerance) for a,b,_ in paired_columns)]
                for (a,b,header), cell in zip(columns, cells):
                    if cell:
                        amounts.append(dict(header_path=header, amount_text=cell[0],
                                            unit_text=config['unit'], **cell[1]))
                indent = first.bbox.left
                if match and code.isascii() and code.isdigit():
                    # Number columns right-align codes. Normalize multi-digit starts
                    # to the one-digit anchor using the observed word's glyph width.
                    # This is a hierarchy cue, never a fabricated output rectangle.
                    weights = sum(1 if ch.isascii() else 2 for ch in first.raw_text)
                    indent += (len(code)-1)*(first.bbox.right-first.bbox.left)/weights
                observations.append(dict(channel=channel_index, canvas=pair[0], page=first.page,
                                         y=y, indent=indent, code=code, label=label,
                                         row_words=row, amounts=amounts))
            # Detection hints are declaration values, not a replacement for printed units.
            if not any(config['unit'] in w.raw_text for page in pair for w in page_words[page]):
                diagnostics['unit_not_observed_on_page'] += 1

    # Observe alignment independently of node reconstruction. These are diagnostic
    # hints: the prototype still requires declared column meaning and boundaries.
    for ci,channel in enumerate(channels):
        for left,right,header in channel['amounts']:
            relevant=[w for index,page in enumerate(pages)
                      if index % stride == channel.get('page_offset',0)
                      for w in page_words[page] if config['body'][0]<=w.bbox.top<config['body'][1]]
            geometry.append(dict(channel=ci,header=header,
                                 alignments=discover_numeric_columns(relevant,(left,right))))

    # Fold label-only lines inside a channel until its next financial item. Do not
    # fold code-looking annotations or other axes into an item's name.
    for ci, channel in enumerate(channels):
        by_page = defaultdict(list)
        for observation in observations:
            if observation['channel'] == ci:
                by_page[observation['page']].append(observation)
        for page, items in by_page.items():
            items.sort(key=lambda r:r['y'])
            lo,hi = channel['label']
            words = page_words[page]
            for i,item in enumerate(items):
                low = item['y'] - config.get('name_lead', 0) - tolerance
                high = (items[i+1]['y'] - config.get('name_lead', 0) - tolerance
                        if i+1<len(items) else config['body'][1])
                extra = [w for w in words if lo <= w.bbox.left < hi and low <= w.bbox.top < high]
                row_ids = {w.id for w in item['row_words']}
                extra = [w for w in extra if w.id not in row_ids and w.id not in excluded_labels and
                         not CODE.fullmatch(w.raw_text) and not NUMBER_PART.fullmatch(w.raw_text)]
                # Avoid grabbing names above a same-baseline number; row words already
                # retain the suffix when Poppler fused the code and name.
                item['label'].extend(extra)

    for item in observations:
        if not item['label']:
            diagnostics['empty_label'] += 1
    observations.sort(key=lambda r:(r['canvas'], r['y'], r['channel']))
    principal = [r['indent'] for r in observations if r['channel']==0]
    centers = cluster_positions(principal, config.get('indent_gap', 3))
    if len(centers) != 3:
        diagnostics['principal_indent_cluster_count'] = len(centers)
    # The declaration may provide a measured indentation hint when numeric suffix
    # width or fused words prevents automatic three-cluster discovery.
    centers = config.get('principal_indents', centers)
    if not centers:
        return Result(NodeTables([], [], issues=['No principal observations']),
                      check_tree([], []), [], dict(diagnostics), False)
    candidates = []
    outputs = []
    for shift in (-1.5, 0, 1.5):
        for branch_mode in ('indent', 'number-style', 'flat'):
            branch_gap = config.get('indent_gap', 3)
            nodes, amounts = [], []
            principal_stack = {}
            branch_stack = {}
            seen = {}
            amount_seen = set()
            unresolved = 0
            branch_centers = {ci: channels[ci].get('indent_hints', cluster_positions([r['indent'] for r in observations if r['channel']==ci], branch_gap))
                              for ci in range(1,len(channels))}
            for r in observations:
                ci = r['channel']
                axis = channels[ci]['axis']
                if ci==0:
                    level = min(range(len(centers)), key=lambda i:abs(r['indent']-centers[i]-shift))
                    parent = principal_stack.get(level-1)
                    if level and parent is None:
                        unresolved += 1
                    for depth in list(principal_stack):
                        if depth>=level:
                            del principal_stack[depth]
                    branch_stack.clear()
                    level_header = ('款','項','目')[level] if level<3 else None
                else:
                    hints = branch_centers[ci]
                    level = min(range(len(hints)), key=lambda i:abs(r['indent']-hints[i]))
                    if branch_mode == 'flat':
                        level = 0
                    elif branch_mode == 'number-style':
                        level = min(level,1) if r['code'] else max(level,2)
                    parent = branch_stack.get((ci,level-1)) if level else principal_stack.get(2)
                    if parent is None:
                        unresolved += 1
                    for key in list(branch_stack):
                        if key[0]==ci and key[1]>=level:
                            del branch_stack[key]
                    level_header = None
                name = text(r['label'], channels[ci].get('separator', separator))
                identity = (parent, axis, level, r['code'], name)
                if ci==0 and identity in seen:
                    key = seen[identity]
                else:
                    key = f'g{len(nodes)}'
                    node = dict(node_key=key,parent_node_key=parent,axis_header=axis,
                                depth=level+1,level_header=level_header,code_text=r['code'],
                                name_text=name,**position(r['row_words']))
                    nodes.append(node)
                    seen[identity]=key
                if ci==0:
                    principal_stack[level]=key
                else:
                    branch_stack[ci,level]=key
                for amount in r['amounts']:
                    own = dict(node_key=key,**amount)
                    signature = (key,amount['header_path'],amount['amount_text'],amount['physical_page'],amount['y0'])
                    if signature not in amount_seen:
                        amount_seen.add(signature)
                        amounts.append(own)
            check = check_tree(nodes,amounts)
            candidates.append(dict(shift=shift,branch_gap=branch_gap,branch_mode=branch_mode,counts=check['counts'],
                                   unresolved=unresolved,passed=check['passed'],
                                   equations=len(check['results'])))
            outputs.append((nodes,amounts,check,unresolved))
    best = min(range(len(candidates)),key=lambda i:(candidates[i]['unresolved'],
               candidates[i]['counts'].get('不一致',0),-candidates[i]['counts'].get('一致',0)))
    nodes,amounts,check,unresolved=outputs[best]
    signatures = {tuple((n['node_key'],n['parent_node_key']) for n in outputs[i][0])
                  for i,c in enumerate(candidates) if c['passed'] and not c['unresolved'] and c['equations']}
    accepted = (check['passed'] and not unresolved and bool(check['results']) and len(signatures)==1
                and not diagnostics.get('unit_not_observed_on_page') and not diagnostics.get('empty_label'))
    diagnostics['passing_distinct_trees']=len(signatures)
    diagnostics['observations']=len(observations)
    return Result(NodeTables(nodes,amounts,unresolved_parent_count=unresolved),check,
                  candidates,{**dict(diagnostics),'column_alignment_hints':geometry},accepted)
