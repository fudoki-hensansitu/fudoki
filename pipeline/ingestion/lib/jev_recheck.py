"""Recheck weak coverage rules with pinned Choice judgments; only add stops."""
from __future__ import annotations

from collections import Counter, defaultdict
import hashlib
import json
import math
import os
from pathlib import Path
import time
import urllib.error
import urllib.request

MODEL = 'jev-1.13.0'
STOP_PROBABILITY = 0.9
# https://docs.typesafe.ai/models: charged per input token; output tokens are free.
INPUT_USD_PER_MILLION = 0.042
SIDECAR_SUFFIX = '.jev.json'
# UTF-8 byte counts conservatively bound tokens, including request framing.
MAX_STATE_BYTES = 28_000
MAX_REQUEST_BYTES = 56_000
CRITERIA = {
    'table_amount': '表の金額。予算額・支出済額・事業費など、項目の金額欄に載る値。',
    'total_amount': '計・小計・合計・歳出合計など、合計行の金額。',
    'annotation_amount': '流用・充用・不用額等の注記の金額。表の項目自体の金額とは別の補足。',
    'non_amount': '金額でない数字。科目や事業の番号、日付・年度・番地・人数・件数・率・頁番号など。',
}
# The rule's accepted meanings, shared across every jurisdiction.
EXPECTED = {
    'non_amount': {'non_amount'},
    'total': {'total_amount'},
    'verified_total': {'total_amount'},
    'annotation': {'annotation_amount', 'non_amount'},
}
DIAGNOSTIC_RULES = {'blocked', 'reported'}


def sidecar(table_path: Path) -> Path:
    return table_path.with_name(table_path.stem + SIDECAR_SUFFIX)


def encoded(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()


def digest(value) -> str:
    return hashlib.sha256(encoded(value)).hexdigest()


def question(digit: dict) -> dict:
    return {'type': 'choice', 'instructions': {
        'question': 'この頁の指定された数字の役割を、同じ行・列の文字と位置関係から選んでください。',
        'target': {k: digit[k] for k in ('text', 'bbox')},
        'coordinates': 'bbox は左・上・右・下、単位 pt。対象の数字だけを判定する。',
    }, 'criteria': CRITERIA}


def validate_answer(answer: dict) -> None:
    probabilities = answer.get('probabilities', {})
    if (answer.get('type') != 'choice' or answer.get('choice') not in CRITERIA
            or set(probabilities) != set(CRITERIA)
            or any(type(p) not in (int, float) or not math.isfinite(p) or not 0 <= p <= 1
                   for p in probabilities.values())
            or abs(sum(probabilities.values()) - 1) > 0.01
            or probabilities[answer['choice']] < max(probabilities.values())):
        raise ValueError(f'Invalid Jev Choice answer: {answer!r}')


def call_api(state, questions, key):
    payload = encoded({'model': MODEL, 'state': state, 'questions': questions})
    for attempt in range(5):
        request = urllib.request.Request('https://api.typesafe.ai/v1/systemone', data=payload,
            headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {key}'}, method='POST')
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            if error.code in (429, 529) and attempt < 4:
                time.sleep(2 ** attempt)
                continue
            raise ValueError(f'Jev request failed: HTTP {error.code}') from error
    raise AssertionError('Unreachable retry state')


def page_states(words, digits):
    """Keep full-page context normally; split oversized pages into horizontal strips."""
    ordered = sorted(words, key=lambda w: (w['bbox'][1], w['bbox'][0], w['text']))

    def state_for(selected):
        return {'document': '日本の自治体の財政資料。座標は左上原点の pt。words の各行は [左,上,右,下,文字]。',
                'words': [[*[round(v, 2) for v in w['bbox']], w['text']] for w in selected]}

    state = state_for(ordered)
    if len(encoded(state)) < MAX_STATE_BYTES:
        yield state, digits
        return
    # Split target rows without losing their neighboring lines. Exact tokenization
    # is service-owned; a conservative byte bound needs no tokenizer dependency.
    if len({d['bbox'][1] for d in digits}) < 2:
        center = digits[0]['bbox'][1]
        local = [w for w in ordered if abs(w['bbox'][1] - center) <= 40]
        state = state_for(local)
        if len(encoded(state)) >= MAX_STATE_BYTES:
            raise ValueError('Jev page row exceeds context budget')
        yield state, digits
        return
    targets = sorted(digits, key=lambda d: d['bbox'][1])
    middle = (targets[0]['bbox'][1] + targets[-1]['bbox'][1]) / 2
    for group in ([d for d in digits if d['bbox'][1] <= middle],
                  [d for d in digits if d['bbox'][1] > middle]):
        low, high = min(d['bbox'][1] for d in group), max(d['bbox'][3] for d in group)
        context = [w for w in ordered if low - 40 <= w['bbox'][1] <= high + 40]
        yield from page_states(context, group)


def load_cache(cache_path: Path) -> dict:
    return json.loads(cache_path.read_text()) if cache_path.is_file() else {'schema_version': 1, 'entries': {}, 'requests': []}


def cached_scope(cache: dict) -> dict:
    if not isinstance(cache.get('scope'), dict) or not isinstance(cache['scope'].get('words'), list):
        raise ValueError('Jev evidence is missing a valid coverage scope; regenerate it with convert')
    return cache['scope']


def write_cache(cache_path: Path, cache: dict) -> None:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = cache_path.with_suffix('.json.tmp')
    temporary.write_bytes(encoded(cache) + b'\n')
    temporary.replace(cache_path)


def recheck(words: list[dict], coverage: dict, cache_path: Path, *, allow_api=False, transport=None,
            scope=None, cache=None) -> dict:
    """Use the cache in verify; convert may fill misses with an injected/API transport.

    Cache keys exclude coverage rules and thresholds: unchanged evidence/questions
    retain their answers when the algorithm changes. Diagnostic answers never pass
    an existing stop or turn a reported digit into a new stop.
    """
    cache = load_cache(cache_path) if cache is None else cache
    if cache.get('schema_version') != 1 or not isinstance(cache.get('entries'), dict):
        raise ValueError('Unsupported Jev cache')
    if scope is not None and allow_api:
        cache['scope'] = scope
    by_page, targets = defaultdict(list), defaultdict(list)
    for word in words:
        by_page[word['page']].append(word)
    for digit in coverage['decisions']:
        if digit['covered'] in EXPECTED or digit['covered'] in DIAGNOSTIC_RULES:
            targets[digit['page']].append(digit)
    judgments, usage = [], Counter()
    requests = 0
    for page in sorted(targets):
        for state, digits in page_states(by_page[page], targets[page]):
            state_hash = digest(state)
            queries = [(digit, question(digit)) for digit in digits]
            keyed = [(digit, q, digest([MODEL, state_hash, digest(q)])) for digit, q in queries]
            missing = [(digit, q, key) for digit, q, key in keyed if key not in cache['entries']]
            if missing and not allow_api:
                raise ValueError(f'Jev cache missing/stale: {cache_path}, p{page}; verify never calls the API')
            key = os.environ.get('TYPESAFE_API_KEY')
            if missing and transport is None and not key:
                raise ValueError('Jev cache missing and TYPESAFE_API_KEY is unavailable; inject it with mise + age')
            batches, batch = [], []
            base_bytes = len(encoded({'model': MODEL, 'state': state, 'questions': {}}))
            batch_bytes = base_bytes
            for item in missing:
                question_bytes = len(encoded({str(len(batch)): item[1]})) - 2
                added_bytes = question_bytes + bool(batch)
                if batch_bytes + added_bytes >= MAX_REQUEST_BYTES and batch:
                    batches.append(batch)
                    batch = []
                    batch_bytes = base_bytes
                    added_bytes = len(encoded({'0': item[1]})) - 2
                batch.append(item)
                batch_bytes += added_bytes
            if batch:
                batches.append(batch)
            for batch in batches:
                questions = {str(i): q for i, (_, q, _) in enumerate(batch)}
                response = (transport or call_api)(state, questions, key)
                if response.get('model') != MODEL or set(response.get('answers', {})) != set(questions):
                    raise ValueError('Jev response model/questions differ from request')
                for answer in response['answers'].values():
                    validate_answer(answer)
                record = {'model': MODEL, 'state_hash': state_hash,
                          'question_hashes': [digest(q) for _, q, _ in batch], 'usage': response['usage']}
                cache['requests'].append(record)
                for i, (_, q, cache_key) in enumerate(batch):
                    cache['entries'][cache_key] = {'model': MODEL, 'state_hash': state_hash,
                        'question_hash': digest(q), 'answer': response['answers'][str(i)]}
                write_cache(cache_path, cache)
                requests += 1
                usage.update(response['usage'])
            for digit, q, cache_key in keyed:
                entry = cache['entries'][cache_key]
                if (entry['model'], entry['state_hash'], entry['question_hash']) != (MODEL, state_hash, digest(q)):
                    raise ValueError('Jev cache identity differs from request')
                answer = entry['answer']
                validate_answer(answer)
                choice = answer['choice']
                probability = answer['probabilities'][choice]
                rule = digit['covered']
                stop = rule in EXPECTED and choice not in EXPECTED[rule] and probability >= STOP_PROBABILITY
                judgments.append({**digit, 'choice': choice, 'probability': probability,
                                  'probabilities': answer['probabilities'], 'stop': stop})
    if scope is not None and allow_api:
        write_cache(cache_path, cache)
    stopped = [j for j in judgments if j['stop']]
    return {'passed': coverage['passed'] and not stopped, 'model': MODEL, 'threshold': STOP_PROBABILITY,
            'questions': len(judgments), 'requests': requests, 'usage': dict(usage),
            'cost_usd': usage['input_tokens'] * INPUT_USD_PER_MILLION / 1_000_000,
            'stopped': stopped, 'judgments': judgments}
