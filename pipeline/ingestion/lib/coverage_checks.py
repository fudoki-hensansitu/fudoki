"""Printed-digit coverage: every printed digit in scope is an amount row or a known non-amount.

A check module (ADR 0027): it only decides pass/fail and never builds or writes a table, so it is
left out of the converters' fingerprint and tightening it does not stale a saved table. Run
``ingestion:verify`` against the saved tables after making it stricter. The helpers that
annotations and the table builders share (word access, notation patterns, exclusion matching) stay in
``node_tables``; this module reads them from there.
"""
from __future__ import annotations

from collections import Counter, defaultdict
import math
import re
import time
import unicodedata

from shared.amount import number
from ingestion.lib.node_tables import (
    DOCUMENT_NUMBER, NON_AMOUNT_WORD, _contains, _coverage_word, _document_notation, _exclusion_hit,
    _notation_context, _word_key, validate_exclusions)


def _word_digits(text):
    return re.sub(r'[^0-9]', '', unicodedata.normalize('NFKC', str(text)))


# Printed control totals. Every settlement prints its aggregate total row; the
# adopted tables keep it as an observation, not as amount rows, and every
# converter asserts its shape. Digits sharing the total row's baseline are
# classified as control totals, counted visibly, never silently passed.
TOTAL_LABELS = frozenset({'歳出合計', '歳出総計'})


# A glued percent sign is never an adopted amount: converters keep rates as
# text or drop them, and parse_amount rejects suffixed values. Bare 円 glue is
# excluded: 円-suffixed prints are adopted amounts and must join their row.
PERCENT_WORD = re.compile(r'[△▲\-－―—]?[0-9][0-9,\.]*[％%]|[(（][0-9][0-9,\.]*[％%][)）]')


# A digit-leading word glued to non-amount characters (codes and counters:
# １０款, １管, 11役, 1報, 1項). 円 glue is excluded (adopted amounts join
# their row); dots and brackets are excluded (versions, decimals, annotations).
CODE_WORD = re.compile(r'[0-9０-９]+[^0-9０-９,△▲\-－―—\.\(\)（）<>＜＞％%円]+')


QUANTITY_PHRASE = re.compile(
    r'(?:[^0-9円]|[0-9][0-9,]*(?:人|名|件|食|回|日|個|台|戸|世帯|本|床|箇所|校|番|丁目|歳|か月|カ月|ヶ月|ヵ月|号|基|m2|㎡|km|m|ｍ|年|月|路線|園|冊|区画))+'
    # an era-year range (`平成12～令和5年度`) and a unit price counted in people (`10,000円延113,835人`)
    r'|(?:令和|平成|昭和|大正|明治)[0-9]+[～〜~](?:令和|平成|昭和)?[0-9]+年度?[^0-9円]*'
    r'|[0-9][0-9,]*円(?:延|×)?[0-9][0-9,]*(?:人|名|件|回|日|個|台|戸|世帯|本|冊|校|園)')


ORDINAL_PHRASE = re.compile(r'(?:[^0-9,円]|第[0-9]+(?:款|項|目|節|土曜日|ブロック|期|農園?)|[0-9]+ブロック|同[款項目節][0-9]+)+')


# Bare folios live in the footer strip. All processed PDFs are ~842pt tall
# with body bottoms at or below 800 (converters read body bands only, and no
# adopted amount prints with top > 795); a bare integer below the strip is an
# amount or a code, never a folio. Revisit if a taller page scope arrives.
FOOTER_TOP = 795.0


LEVEL_MARKS = ('款', '項', '目', '節')


def _level_marks(code, level):
    """A subject's own code printed with its level mark: 1項, 第1項, （目）2."""
    if not code or level not in LEVEL_MARKS:
        return ()
    return (f'{code}{level}', f'第{code}{level}', f'({level}){code}')


# An amount-shaped token is never a label, even inside a node box and even
# when it substrings the name: grouping separators, 円 glue and leading
# signs mark prints, while bare codes stay label-eligible.
def _amount_shaped(key):
    return bool(re.search(r'[0-9]+(?:,[0-9]+)+|[0-9,]+円|[△▲\-－―—][0-9]', key))


def _verified_total_boxes(words, tables, amount_columns, tolerance, candidate_baselines):
    """Confirm unlabeled totals using direct siblings in one adopted tree.

    An unlabeled row requires two independent nonzero columns, after all
    their siblings. An explicit total label still requires the exact
    sum, including zero. Match each column's complete print; a lone zero cannot establish a total.
    """
    baselines = defaultdict(list)
    total_labels = defaultdict(list)
    for raw in words:
        page, box, text = _coverage_word(raw)
        if _word_key(text) in ('計', '合計', '小計') or _word_key(text) in TOTAL_LABELS:
            total_labels[page, round(box[1])].append(box)
        if (page, round(box[1])) in candidate_baselines and re.fullmatch(r'[0-9,△▲\-－―—]+', _word_key(text)):
            baselines[page, round(box[1])].append((box, text))
    verified = set()
    for table in tables:
        nodes = {n['node_key']: n for n in table.nodes}
        siblings = defaultdict(list)
        amount_lookup = defaultdict(list)
        parent_amounts = defaultdict(list)
        for amount in table.amounts:
            node = nodes.get(amount['node_key'])
            if (node is None or node['axis_header'] == '注記' or any(amount[k] is None for k in ('physical_page', 'x0', 'y0', 'x1', 'y1'))
                    or number(amount['amount_text']) is None):
                continue
            identity = (node['parent_node_key'], node['axis_header'], node['level_header'],
                        amount['header_path'], amount['unit_text'])
            siblings[identity].append(amount)
            amount_lookup[amount['node_key'], amount['header_path'], amount['unit_text']].append(amount)
            parent_amounts[amount['node_key'], amount['unit_text']].append(amount)
        # Missing zero leaf cells have no amount rows. As in check_tree,
        # their contribution is zero, but only an explicit 計 row may verify
        # the zero and the header must exist on this same axis/level.
        node_groups = defaultdict(list)
        headers = defaultdict(set)
        for node in table.nodes:
            if node['axis_header'] != '注記':
                node_groups[node['parent_node_key'], node['axis_header'], node['level_header']].append(node)
        for identity in siblings:
            headers[identity[1:3]].add(identity[-2:])
        zero_groups = []
        for identity, children in node_groups.items():
            located = [n for n in children if n['physical_page'] is not None and n['y1'] is not None]
            if not located:
                continue
            for header, unit in headers[identity[1:]]:
                if (*identity, header, unit) in siblings:
                    continue
                columns = [c['x_range'] for c in amount_columns
                           if c.get('header') in (header, header.split('／')[-1])]
                if len(columns) == 1:
                    zero_groups.append(((*identity, header, unit), 0,
                                        max((n['physical_page'], n['y1']) for n in located),
                                        *columns[0], len(children), None))
        groups = list(siblings.items())
        for identity, amounts in siblings.items():
            pages = defaultdict(list)
            for amount in amounts:
                pages[amount['physical_page']].append(amount)
            if len(pages) > 1:
                groups.extend(((*identity[:-2], 'page', page, *identity[-2:]), values)
                              for page, values in pages.items())
        # Multiple printed subtables can share one parent. Their explicit
        # 計 rows delimit the sibling segments; keep each header independent.
        for identity, amounts in siblings.items():
            for page in {a['physical_page'] for a in amounts}:
                values = [a for a in amounts if a['physical_page'] == page]
                left = min(a['x0'] for a in values)
                stops = sorted(y for (p, y), labels in total_labels.items()
                               if p == page and any(b[2] <= left for b in labels))
                previous = float('-inf')
                for stop in stops:
                    segment = [a for a in values if previous < a['y0'] < stop]
                    if segment:
                        groups.append(((*identity[:-2], 'segment', page, stop, *identity[-2:]), segment))
                    previous = stop
        totals = zero_groups
        for identity, amounts in groups:
            header = identity[-2]
            columns = [entry['x_range'] for entry in amount_columns
                       if entry.get('header') in (header, header.split('／')[-1])]
            aligned = [span for span in columns if all(span[0] - tolerance <= (a['x0'] + a['x1']) / 2 <= span[1] + tolerance for a in amounts)]
            if len(aligned) == 1:
                left, right = aligned[0]
            else:
                left, right = min(a['x0'] for a in amounts), max(a['x1'] for a in amounts)
            expected = sum(number(a['amount_text']) for a in amounts)
            parent_prints = [a for a in amount_lookup[identity[0], header, identity[-1]]
                             if number(a['amount_text']) == expected and a['x0'] is not None
                             and a['x0'] < right + tolerance and left - tolerance < a['x1']]
            if parent_prints:
                left = min(left, min(a['x0'] for a in parent_prints))
                right = max(right, max(a['x1'] for a in parent_prints))
            totals.append((identity, expected,
                           max((a['physical_page'], a['y1']) for a in amounts), left, right, len(amounts),
                           {p:min(nodes[a['node_key']]['y0'] for a in amounts
                                   if a['physical_page'] == p and nodes[a['node_key']]['y0'] is not None)
                            for p in {a['physical_page'] for a in amounts}
                            if any(a['physical_page'] == p and nodes[a['node_key']]['y0'] is not None for a in amounts)}))
        named_lines = defaultdict(list)
        for raw in words:
            p, b, text = _coverage_word(raw)
            named_lines[p, round(b[1])].append((b, _word_key(text)))
        balance_cache = {(identity[0], expected, identity[-1]):
                         any(number(a['amount_text']) == expected for a in parent_amounts[identity[0], identity[-1]])
                         for identity, expected, *_ in totals}
        matched_rows = []
        established = defaultdict(list)
        for (page, y), row in baselines.items():
            matches = defaultdict(list)
            for identity, expected, last, left, right, sibling_count, first in totals:
                leading = first is not None and page in first and 0 < first[page] - y <= 30
                after = (page, y) > last
                parent_balance = balance_cache[identity[0], expected, identity[-1]]
                if not after and not leading:
                    label_possible = total_labels[page, y] or any(
                        _word_key(identity[-2].split('／')[-1]) == text for _, text in named_lines[page, y])
                    if not parent_balance or not label_possible:
                        continue
                parts = sorted(((box, text) for box, text in row
                                if box[0] < right + tolerance and left - tolerance < box[2]),
                               key=lambda item: item[0][0])
                runs = []
                for part in parts:
                    if not runs or part[0][0] - runs[-1][-1][0][2] > 12:
                        runs.append([])
                    runs[-1].append(part)
                # A complete money word can touch an adjacent column's span.
                # Match complete contiguous words, never a digit substring.
                exact = [run[start:end] for run in runs
                         for start in range(len(run)) for end in range(start + 1, len(run) + 1)
                         if number(''.join(text for _, text in run[start:end])) == expected]
                parts = exact[0] if len(exact) == 1 else []
                labeled = parts and any(box[2] <= parts[0][0][0] for box in total_labels[page, y])
                if parts and any(_word_key(identity[-2].split('／')[-1]) == text and box[2] <= parts[0][0][0]
                                 for box, text in named_lines[page, y]):
                    labeled = True
                # In a multi-column page an explicit 計 can precede some
                # siblings vertically while following them in reading order.
                # Require the same balanced adopted parent to prove the sum.
                if not after and not leading and not (labeled and parent_balance):
                    continue
                if leading:
                    parent = nodes.get(identity[0])
                    known = amount_lookup[identity[0], identity[-2], identity[-1]]
                    if parent is None or len(known) != 1 or number(known[0]['amount_text']) != expected:
                        continue
                    # Only a continuation total of the same balanced parent
                    # directly above its first child can repeat before leaves.
                    labeled = True
                if (parts and (sibling_count >= 2 or labeled)
                        and number(''.join(text for _, text in parts)) == expected):
                    if (leading or labeled) and expected != 0:
                        verified.update((page, tuple(box)) for box, _ in parts)
                    matches[identity[:-2]].append((identity[-2], expected, parts))
            for identity, group in matches.items():
                nonzero = [(header, {tuple(box) for box, _ in parts})
                           for header, expected, parts in group if expected != 0]
                independent = any(left_header != right_header and not left_boxes.intersection(right_boxes)
                                  for index, (left_header, left_boxes) in enumerate(nonzero)
                                  for right_header, right_boxes in nonzero[index + 1:])
                labeled = any(any(label[2] <= parts[0][0][0]
                                                    for label in total_labels[page, y])
                              for _, expected, parts in group)
                if independent or labeled:
                    verified.update((page, tuple(box)) for _, expected, parts in group
                                    if independent or labeled for box, _ in parts)
                    height = max(box[3] - box[1] for _, _, parts in group for box, _ in parts)
                    established[page, identity].append((y, height))
            matched_rows.append((page, y, matches))
        # A wrapped total cell can print one row below the established total.
        # Its nonzero value must match the same sibling group's sum exactly.
        for page, y, matches in matched_rows:
            for identity, group in matches.items():
                if any(0 < y - top <= 3 * height for top, height in established[page, identity]):
                    verified.update((page, tuple(box)) for _, expected, parts in group
                                    if expected != 0 for box, _ in parts)
    return verified


def _continued_subject_boxes(words, control_tables, tolerance):
    """Confirm repeated 款/項/目 codes against an adopted ancestor chain."""
    by_page = defaultdict(list)
    for raw in words:
        page, box, text = _coverage_word(raw)
        by_page[page].append((box, _word_key(text)))
    page_headers = {}
    page_codes = {}
    for page, printed in by_page.items():
        headers = [(box, text) for box, text in printed
                   if text.strip('()（）') in ('款', '項', '目', '款項', '款項目')]
        if {'款', '項', '目'} <= set(''.join(text.strip('()（）') for _, text in headers)):
            page_headers[page] = headers
            numeric = defaultdict(list)
            # A code can be split into touching glyphs (10 -> 1, 0).
            digits = sorted(((box, text) for box, text in printed if re.fullmatch(r'[0-9]+', text)), key=lambda item: (round(item[0][1]), item[0][0]))
            for start, (box, text) in enumerate(digits):
                numeric[text].append((box, [box]))
                joined, parts = text, [box]
                for next_box, next_text in digits[start + 1:start + 3]:
                    if abs(next_box[1] - box[1]) > 2 or not -tolerance <= next_box[0] - parts[-1][2] <= tolerance:
                        break
                    joined += next_text
                    parts.append(next_box)
                    union = (box[0], min(b[1] for b in parts), next_box[2], max(b[3] for b in parts))
                    numeric[joined].append((union, list(parts)))
            fragments = {tuple(part) for values in numeric.values() for _, parts in values
                         if len(parts) > 1 for part in parts}
            page_codes[page] = {text:[(box, parts) for box, parts in values
                                     if len(parts) > 1 or tuple(box) not in fragments]
                                for text, values in numeric.items()}
    matched = set()
    for table in control_tables:
        nodes = {n['node_key']: n for n in table.nodes}
        code_columns = defaultdict(set)
        for node in table.nodes:
            if node['level_header'] not in ('款', '項', '目') or node['x0'] is None:
                continue
            for box, text in by_page.get(node['physical_page'], ()):
                if text and _word_digits(text) and not _amount_shaped(text) and _word_key(str(node['code_text'] or '') + str(node['name_text'] or '')).startswith(text) and abs(box[0] - node['x0']) <= tolerance and node['y0'] - tolerance <= box[1] <= node['y1'] + tolerance:
                    code_columns[node['level_header']].add(round(box[0], 1))
        for moku in table.nodes:
            if moku['level_header'] != '目':
                continue
            chain = [moku]
            while chain[-1]['parent_node_key'] in nodes:
                chain.append(nodes[chain[-1]['parent_node_key']])
            chain.reverse()
            if [n['level_header'] for n in chain] != ['款', '項', '目'] or any(
                    n['code_text'] is None or n['x0'] is None for n in chain):
                continue
            for page, headers in page_headers.items():
                candidates = [[(box, parts) for box, parts in page_codes[page].get(_word_key(n['code_text']), ())
                               if any(abs(box[0] - x) <= max(tolerance, (box[2] - box[0]) / 2)
                                      for x in code_columns[n['level_header']])] for n in chain]
                for first, first_parts in candidates[0]:
                    if not any(0 < first[1] - header[1] <= 6 * (header[3] - header[1])
                               for header, _ in headers):
                        continue
                    row = list(first_parts)
                    for column in candidates[1:]:
                        hits = [(box, parts) for box, parts in column if abs(box[1] - first[1]) <= 2]
                        if len(hits) != 1:
                            break
                        row.extend(hits[0][1])
                    # A printed hierarchy header can carry a prefix (款/項)
                    # while 目 starts on its own line. Match only observed
                    # ancestor codes in their adopted column positions.
                    matched.update((page, tuple(box)) for box in row)
    return matched


# Digits a weak rule passed or that no band owns: the only ones Jev is asked.
RECHECKED = ('non_amount', 'reported')


def _apply_recheck(normalized, words, amount_columns, recheck):
    """Stop weakly passed and out-of-band digits Jev reads as amounts to ingest.

    Mutates covered to 'jev_blocked' (never the other way) and attaches the
    probability as 'jev'. Returns the persistable answers and a short summary.
    """
    index = recheck.context_index((_coverage_word(w) for w in words), amount_columns)

    def context(w):
        return index.context(w['page'], w['bbox'], w['text'])
    asked = [w for w in normalized if w['covered'] in RECHECKED and w.get('form') != 'document_number']
    blocked = [w for w in normalized if w['covered'] == 'blocked']
    contexts = [context(w) for w in asked]
    try:
        probabilities = recheck.answers(contexts)
    except recheck.unavailable:
        # A table with a band stop fails anyway, and the stop is the clearer reason.
        if not blocked:
            raise
        asked, contexts, probabilities = [], [], []
    answers, stopped = {}, 0
    for w, c, p in zip(asked, contexts, probabilities):
        answers[recheck.fingerprint(c)] = p
        w['jev'] = p
        if p >= recheck.threshold:
            w['rule'], w['covered'] = w['covered'], 'jev_blocked'
            stopped += 1
    hints = recheck.answers([context(w) for w in blocked], required=False) if blocked else []
    for w, p in zip(blocked, hints):
        if p is not None:
            w['jev'] = p
    return {'answers': answers, 'asked': len(asked), 'stopped': stopped,
            'hinted': sum(p is not None for p in hints)}


def check_digit_coverage(words, tables, *, tolerance=0.5, exclusions=(), amount_columns=(), control_tables=(),
                         recheck=None):
    """Every printed digit in scope is an amount row or a known non-amount.

    words are the printed words of the pages and regions the converter
    processed. tables are migrated node tables whose amount rows carry their
    own printed positions. Amount-column bands are built commonly from the
    converter's amount-column geometry, with row spans as a visible fallback.
    A digit word is covered when (a) it sits inside an amount's own box as
    part of that print, (b) it sits inside its node's box and reads as the
    node's code or name, (c) it fullmatches a jurisdiction-common non-amount
    pattern (folio, era/year/date, glued percent, code glued to characters,
    footer folio, percent pair), (d) it shares a control-total baseline, or
    (e) a merged word split into adopted amounts rejoins exactly, or (f) its
    value is a verified sibling total. control_tables retain independent
    trees for total arithmetic when tables contains pooled coverage prints.
    Leftovers split by band: inside an amount band they are BLOCKED prints
    (a dropped amount in amount territory stops the save); outside bands
    they are REPORTED prose (counted with examples, never blocking).
    Excluded regions (declared non-ingested tables with a kind and a reason)
    are skipped with visible counts but never block. Amount bands come from
    the converter's amount-column heading positions when supplied, else fall
    back to clustering adopted amount rows. Returns
    the elapsed seconds alongside the verdict for per-table timing reports.
    Overhanging fragments require exact digit reconstruction; nearby unmatched prints stay uncovered.
    recheck (digit_recheck.Recheck) asks Jev about exactly two kinds of digit:
    those a weak rule passed (non_amount) and those reported outside every
    band. An answer at or above its threshold stops the save ('jev_blocked',
    listed with the rule that passed it); a lower one clears nothing. Digits
    explained by adopted amounts, labels, totals or declared exclusions are
    never asked, and a digit already blocked in a band stays blocked whatever
    Jev says (its probability is only attached as a hint).
    """
    started = time.perf_counter()
    if tolerance < 0 or not math.isfinite(tolerance):
        raise ValueError('Coverage tolerance must be a nonnegative finite number')
    exclusions = validate_exclusions(exclusions)
    exclusion_counts = [0] * len(exclusions)
    exclusions_by_page = defaultdict(list)
    for index, entry in enumerate(exclusions):
        pages = [entry['page']] if 'bbox' in entry else [
            page for first, last in entry['pages'] for page in range(first, last + 1)]
        for page in pages:
            exclusions_by_page[page].append((index, entry))
    normalized = []
    for word in words:
        page, box, text = _coverage_word(word)
        digits = _word_digits(text)
        if digits:
            normalized.append({'page': page, 'bbox': list(box), 'text': text,
                               'digits': digits, 'key': _word_key(text), 'covered': None})
    positioned = [a for a in tables.amounts
                  if a['physical_page'] is not None and None not in (a['x0'], a['y0'], a['x1'], a['y1'])]
    positioned_by_page = defaultdict(list)
    for a in positioned:
        positioned_by_page[a['physical_page']].append(a)
    # Amount-column bands from heading positions when the converter supplies
    # them, else from adopted rows. Per-header spans never merge across
    # headers; adopted rows cluster by overlap. Unlabeled fallback stays
    # visible so converters without fixed columns are listed, not hidden.
    bands, bands_from = [], 'rows'
    if amount_columns:
        bands_from = 'columns'
        grouped = defaultdict(list)
        for entry in amount_columns:
            grouped[entry.get('header')].append(tuple(entry['x_range']))
        for spans in grouped.values():
            merged = []
            for left, right in sorted(spans):
                if merged and left <= merged[-1][1] + 10:
                    merged[-1][1] = max(merged[-1][1], right)
                else:
                    merged.append([left, right])
            bands.extend(merged)
    else:
        for left, right in sorted((a['x0'], a['x1']) for a in positioned):
            if bands and left <= bands[-1][1] + 10:
                bands[-1][1] = max(bands[-1][1], right)
            else:
                bands.append([left, right])

    def in_band(word):
        center = (word['bbox'][0] + word['bbox'][2]) / 2
        return any(left - tolerance <= center <= right + tolerance for left, right in bands)

    words_by_page = defaultdict(list)
    for w in normalized:
        words_by_page[w['page']].append(w)
    for amount in positioned:
        box = (amount['x0'], amount['y0'], amount['x1'], amount['y1'])
        inside = sorted(
            (w for w in words_by_page.get(amount['physical_page'], [])
             if w['covered'] is None and _contains(box, w['bbox'], tolerance)),
            key=lambda w: (w['bbox'][1], w['bbox'][0]))
        # Words inside an amount's own box are part of that print. The tree
        # check owns value correctness; coverage owns the print's presence.
        for w in inside:
            w['covered'] = 'amount'
    # Poppler glyph boxes can overhang a converter's cell boundary. Cover
    # those fragments only when the complete overlapping print rejoins the
    # adopted amount's digits exactly. A nearby extra digit fails this match.
    for amount in positioned:
        box = (amount['x0'], amount['y0'], amount['x1'], amount['y1'])
        parts = sorted((w for w in words_by_page.get(amount['physical_page'], ())
                        if w['bbox'][0] < box[2] + tolerance and box[0] - tolerance < w['bbox'][2]
                        and min(box[3], w['bbox'][3]) - max(box[1], w['bbox'][1])
                        >= min(box[3] - box[1], w['bbox'][3] - w['bbox'][1]) / 2),
                       key=lambda w: (w['bbox'][0], w['bbox'][1]))
        if parts and ''.join(w['digits'] for w in parts) == _word_digits(amount['amount_text']):
            for word in parts:
                if word['covered'] is None:
                    word['covered'] = 'amount_fragments'
    # A word merged across two printed cells is covered when the amounts it
    # was split into sit inside its box and rejoin its digits exactly. Both
    # split amounts must exist as adopted rows; coincidence cannot cover.
    for word in normalized:
        if word['covered'] is not None:
            continue
        parts = sorted(
            (a for a in positioned_by_page.get(word['page'], [])
             if _contains(tuple(word['bbox']), (a['x0'], a['y0'], a['x1'], a['y1']), tolerance)),
            key=lambda a: (a['x0'], a['y0']))
        if len(parts) >= 2 and ''.join(_word_digits(a['amount_text']) for a in parts) == word['digits']:
            word['covered'] = 'split_amount'
    boxed_by_page = defaultdict(list)
    for n in tables.nodes:
        if n['physical_page'] is not None and None not in (n['x0'], n['y0'], n['x1'], n['y1']):
            boxed_by_page[n['physical_page']].append(n)
    for word in normalized:
        if word['covered'] is not None:
            continue
        for node in boxed_by_page.get(word['page'], []):
            if not _contains((node['x0'], node['y0'], node['x1'], node['y1']), word['bbox'], tolerance):
                continue
            code = _word_key(str(node.get('code_text') or ''))
            printed = code + _word_key(str(node.get('name_text') or ''))
            # A sub-item number's bracket may be dropped from the word (`10(1)消耗品費` read `1消耗品費`).
            if word['key'] and not _amount_shaped(word['key']) and (
                    word['key'] in printed or word['key'] in re.sub(r'[()（）]', '', printed)
                    or word['key'] in _level_marks(code, node.get('level_header'))):
                word['covered'] = 'label'
                break
    # Adopted prints take precedence over an auxiliary block. An exclusion
    # may span the same baseline, but must never hide adopted amounts/labels.
    for word in normalized:
        if word['covered'] is None:
            candidates = exclusions_by_page.get(word['page'], ())
            hit = _exclusion_hit(word, [entry for _, entry in candidates], tolerance)
            if hit is not None:
                word['covered'] = 'excluded'
                exclusion_counts[candidates[hit][0]] += 1
    for word in normalized:
        if word['covered'] is None and NON_AMOUNT_WORD.fullmatch(_word_key(word['text'])):
            word['covered'] = 'non_amount'
    for word in normalized:
        if word['covered'] is None and PERCENT_WORD.fullmatch(_word_key(word['text'])):
            word['covered'] = 'non_amount'
    for word in normalized:
        if word['covered'] is None and CODE_WORD.fullmatch(_word_key(word['text'])):
            word['covered'] = 'non_amount'
    for word in normalized:
        if word['covered'] is None and re.fullmatch(r'[0-9０-９]+', _word_key(word['text'])) \
                and isinstance(word['page'], int) and word['bbox'][3] > FOOTER_TOP:
            word['covered'] = 'non_amount'
    # Printed document numbers and dates can be split by Poppler. Match an
    # exact, spatially adjacent sequence; never exempt all digits on its row.
    # A resolution/decision number (令和7年第7号・第54号) cannot read as an
    # amount, so it is explained outright instead of being left for recheck.
    document_boxes = set()
    non_amount_boxes, lines, merged_lines = _notation_context(
        words, lambda text: _document_notation(text) or QUANTITY_PHRASE.fullmatch(text) or ORDINAL_PHRASE.fullmatch(text),
        strong=lambda text: bool(DOCUMENT_NUMBER.fullmatch(text)), strong_boxes=document_boxes)
    for word in normalized:
        # A fragment (7号) may already read as a glued code; the number still explains it.
        if word['covered'] in (None, 'non_amount') and (word['page'], tuple(word['bbox'])) in document_boxes:
            word['covered'], word['form'] = 'non_amount', 'document_number'
    for word in normalized:
        if word['covered'] is None and (word['page'], tuple(word['bbox'])) in non_amount_boxes:
            word['covered'] = 'non_amount'
    for word in normalized:
        # A middle-dot list of days or counts (23・24日) is never an amount.
        if word['covered'] is not None or not re.fullmatch(r'[0-9][0-9,]*(?:[・･][0-9][0-9,]*)*', word['key']):
            continue
        adjacent = [part for offset in range(-2, 3)
                    for part in lines.get((word['page'], round(word['bbox'][1]) + offset), ())]
        for b, text in adjacent:
            if abs(b[1] - word['bbox'][1]) <= 2 and 0 <= b[0] - word['bbox'][2] <= 5:
                if re.match(r'(?:人|名|件|食|回|日|個|台|戸|世帯|本|床|箇所|校|番|丁目|歳|か月|号|基|㎡|km|路線)', _word_key(text)):
                    word['covered'] = 'non_amount'
                    break
    # A bare number immediately followed by a percent word on its baseline is
    # an execution rate, never an adopted amount. Percent signs carry no
    # digits, so marks come from every scope word, not only digit words.
    percent_marks = defaultdict(list)
    percent_units = defaultdict(list)
    for word in words:
        try:
            page, box, text = _coverage_word(word)
        except (KeyError, TypeError, ValueError):
            continue
        if isinstance(page, int) and re.fullmatch(r'[％%]', _word_key(text)):
            percent_marks[(page, round(box[1]))].append(box[0])
            percent_units[page].append(box)
    for word in normalized:
        if word['covered'] is not None:
            continue
        if not re.fullmatch(r'[0-9][0-9,\.]*', word['key']) or not isinstance(word['page'], int):
            continue
        for mark_x in percent_marks.get((word['page'], round(word['bbox'][1])), []):
            if 0 <= mark_x - word['bbox'][2] <= 5:
                word['covered'] = 'non_amount'
                break
    # A standalone percent unit just above the numeric cell is also an
    # execution rate. The unit and value share the printed right alignment.
    for word in normalized:
        if word['covered'] is not None or not re.fullmatch(r'[0-9]+(?:\.[0-9]+)?', word['key']):
            continue
        for box in percent_units.get(word['page'], ()):
            if (0 < word['bbox'][1] - box[1] <= 20
                    and box[0] - 5 <= word['bbox'][2] <= box[2] + tolerance):
                word['covered'] = 'non_amount'
                break
    # Control-total baselines: group every scope word by printed page and
    # baseline, and cover digits sharing a baseline with a total-dictionary
    # label. Labels may split across words, so match against the joined
    # baseline text. The label itself carries no digits, so grouping must see
    # all words, not only digit words.
    by_baseline = defaultdict(list)
    for word in words:
        try:
            page, box, text = _coverage_word(word)
        except (KeyError, TypeError, ValueError):
            continue
        if isinstance(page, int):
            by_baseline[(page, round(box[1]))].append((box, _word_key(text)))
    total_baselines = {key for key, line in merged_lines.items()
                       if any(label in ''.join(text for _, text in sorted(line)) for label in TOTAL_LABELS)}
    for word in normalized:
        if word['covered'] is None and isinstance(word['page'], int) \
                and any(p == word['page'] and abs(y - word['bbox'][1]) <= 2 for p, y in total_baselines):
            word['covered'] = 'total'
    total_boxes = _verified_total_boxes(
        words, control_tables or (tables,), amount_columns, tolerance,
        {(word['page'], round(word['bbox'][1])) for word in normalized if word['covered'] is None or word['covered'] == 'total'})
    for word in normalized:
        if word['covered'] is None and (word['page'], tuple(word['bbox'])) in total_boxes:
            word['covered'] = 'verified_total'
    repeated = _continued_subject_boxes(words, control_tables or (tables,), tolerance)
    for word in normalized:
        if word['covered'] is None and (word['page'], tuple(word['bbox'])) in repeated:
            word['covered'] = 'label'
    for word in normalized:
        if word['covered'] is None:
            word['covered'] = 'blocked' if in_band(word) else 'reported'
    jev = _apply_recheck(normalized, words, amount_columns, recheck) if recheck is not None else None

    def listed(w):
        item = {'page': w['page'], 'bbox': w['bbox'], 'text': w['text']}
        if w.get('jev') is not None:
            item['jev'] = w['jev']
        if w.get('rule'):
            item['rule'] = w['rule']
        return item
    blocked = [listed(w) for w in normalized if w['covered'] in ('blocked', 'jev_blocked')]
    reported = [listed(w) for w in normalized if w['covered'] == 'reported']
    blocked.sort(key=lambda w: (w['page'] if isinstance(w['page'], int) else 0, w['bbox'][1], w['bbox'][0]))
    reported.sort(key=lambda w: (w['page'] if isinstance(w['page'], int) else 0, w['bbox'][1], w['bbox'][0]))
    counts = dict(Counter(w['covered'] for w in normalized))
    applied = [{'kind': e['kind'], 'reason': e['reason'], 'words': n}
               for e, n in zip(exclusions, exclusion_counts)]
    return {'passed': not blocked, 'counts': counts,
            'digit_words': len(normalized), 'uncovered': blocked, 'reported': reported,
            'bands_from': bands_from, 'exclusions': applied, 'jev': jev,
            'elapsed': time.perf_counter() - started}
