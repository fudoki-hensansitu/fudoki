"""Jev recheck of printed digits that weak rules passed or that sit outside amount bands.

check_digit_coverage explains printed digits with adopted amounts and nodes
(strong) or with jurisdiction-common non-amount patterns (weak), and stops
only digits inside an amount-column band that nothing explains. Two kinds of
digits pass silently: those a weak rule called "not an amount", and those
outside every band left as a report. This module asks one narrow question about
exactly those: is this a value to ingest as an amount of a table item?

Jev only adds stops. A probability at or above THRESHOLD stops the save; a
lower one never clears anything, and digits already stopped inside a band stay
stopped (their probability is only attached as a hint). Answers are stored
beside the manifest as fingerprint -> probability and replayed without the API;
a missing answer with no key stops instead of being skipped.

The context sentence is assembled in code from the printed words: the words of
the same line from the left with the target marked 【】, the column heading and
the lines above and below. No coordinates and no reason the rules passed it are
sent; the experiment showed the reason made real amounts easier to miss.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

MODEL = 'jev-1.13.0'
THRESHOLD = 0.7
ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
KEY_ENV = 'TYPESAFE_API_KEY'
STORE_SUFFIX = '.digit-recheck.jsonl'
STORE_VERSION = 1
BATCH = 25
WORKERS = 4
RETRIES = 5
# TypeSafe bills input tokens only (docs.typesafe.ai/models, 2026-10).
USD_PER_INPUT_TOKEN = 0.042 / 1_000_000

# `{id}` is the batch-local question key; the context sits at `items.{id}`.
INSTRUCTIONS = ('日本の自治体の決算書（歳出）のある頁から、数字を1つ取り出した。'
                '文脈は `items.{id}` にある（同じ行の語を左から並べた文、列の見出し、上下の行）。'
                '取り出した数字 `items.{id}.対象の数字`（同じ行では【】で示す）は、表の項目の金額として取り込むべき値か。')
CRITERIA = {
    'true': '表の項目（科目・事業）の金額として取り込むべき値。例: 予算額、補正額、決算額、支出済額、不用額、事業費、'
            '国・県支出金など、表の金額の欄に印字された円の金額（0 や 1,234,000 のような値も含む）。',
    'false': '取り込むべきでない数字。例: 款・項・目・節・事業の番号、頁番号、年月日・年度・議決の号数（令和8年第6号）、'
             '住所の番地、人数・件数・回数・面積などの数量、率（％）、本文や注記の中の数字、'
             '「第10節へ同項同目第8節から流用 12,846」のような流用・充用の注記の金額。'}


class RecheckUnavailable(ValueError):
    """Answers are missing and there is no key to ask for them."""


def _canonical(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()


def fingerprint(context: dict, *, model: str = MODEL, threshold: float = THRESHOLD) -> str:
    """Identity of one question: any change to the sentence, question, model or threshold is a new question."""
    body = {'model': model, 'instructions': INSTRUCTIONS, 'criteria': CRITERIA,
            'threshold': threshold, 'context': context}
    return hashlib.sha256(_canonical(body)).hexdigest()[:32]


class ContextIndex:
    """Line-oriented view of one table's printed words, for building question contexts."""

    def __init__(self, words, amount_columns=()):
        by_page = defaultdict(list)
        for page, box, text in words:
            by_page[page].append((tuple(box), str(text)))
        self.lines = {}
        for page, printed in by_page.items():
            printed.sort(key=lambda item: (item[0][1], item[0][0]))
            lines = []
            for box, text in printed:
                if lines and abs(box[1] - lines[-1]['top']) <= 2:
                    lines[-1]['words'].append((box, text))
                else:
                    lines.append({'top': box[1], 'words': [(box, text)]})
            for line in lines:
                line['words'].sort(key=lambda item: item[0][0])
                line['text'] = ' '.join(text for _, text in line['words'])
            self.lines[page] = lines
        self.columns = [(entry.get('header'), tuple(entry['x_range'])) for entry in amount_columns]

    def context(self, page, box, text) -> dict:
        box = tuple(box)
        lines = self.lines.get(page, ())
        position = next((i for i, line in enumerate(lines) if abs(line['top'] - box[1]) <= 2), None)
        center = (box[0] + box[2]) / 2
        header = next((h for h, (left, right) in self.columns if left - 0.5 <= center <= right + 0.5), None)
        if position is None:
            marked, above, below = f'【{text}】', '', ''
        else:
            line = lines[position]
            marked, hit = [], False
            for word_box, word_text in line['words']:
                if not hit and word_box == box and word_text == text:
                    marked.append(f'【{word_text}】')
                    hit = True
                else:
                    marked.append(word_text)
            marked = ' '.join(marked)
            above = lines[position - 1]['text'] if position > 0 else ''
            below = lines[position + 1]['text'] if position + 1 < len(lines) else ''
        return {'対象の数字': text, '同じ行（左から。対象は【】）': marked,
                '数字の列の見出し': header or 'なし', 'すぐ上の行': above or 'なし', 'すぐ下の行': below or 'なし'}


def _post(key: str, state: dict, questions: dict, model: str) -> dict:
    body = json.dumps({'state': state, 'model': model, 'questions': questions}).encode()
    for attempt in range(RETRIES):
        request = urllib.request.Request(
            ENDPOINT, data=body, method='POST',
            headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {key}'})
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            if error.code in (429, 500, 502, 503, 529) and attempt < RETRIES - 1:
                time.sleep(2 ** attempt)
                continue
            raise RuntimeError(f'TypeSafe HTTP {error.code}: {error.read()[:300]!r}') from None
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt < RETRIES - 1:
                time.sleep(2 ** attempt)
                continue
            raise RuntimeError(f'TypeSafe request failed: {error}') from None
    raise AssertionError('unreachable')


class HttpAsk:
    """Ask Jev in batches; ``__call__(contexts)`` returns one probability per context, in order."""

    def __init__(self, key: str, *, model: str = MODEL):
        self.key, self.model = key, model
        self.usage = Counter()
        self.requests = 0

    def __call__(self, contexts: list[dict]) -> list[float]:
        batches = [list(range(i, min(i + BATCH, len(contexts)))) for i in range(0, len(contexts), BATCH)]

        def run(batch):
            ids = {f'q{i}': i for i in batch}
            state = {'items': {q: contexts[i] for q, i in ids.items()}}
            questions = {q: {'type': 'noul', 'instructions': INSTRUCTIONS.format(id=q), 'criteria': CRITERIA}
                         for q in ids}
            response = _post(self.key, state, questions, self.model)
            answers = response.get('answers', {})
            result = []
            for q, i in ids.items():
                p = answers[q]['noul']
                if type(p) not in (int, float) or not 0 <= p <= 1:
                    raise RuntimeError(f'TypeSafe returned an invalid probability: {p!r}')
                result.append((i, float(p)))
            return result, response.get('usage') or {}

        probabilities = [None] * len(contexts)
        with ThreadPoolExecutor(WORKERS) as pool:
            for pairs, usage in pool.map(run, batches):
                self.requests += 1
                self.usage.update({k: v for k, v in usage.items() if isinstance(v, int)})
                for i, p in pairs:
                    probabilities[i] = p
        return probabilities


class Recheck:
    """Answers by question fingerprint. A cache hit never calls the API."""

    def __init__(self, known: dict[str, float] | None = None, *, ask=None, threshold: float = THRESHOLD,
                 model: str = MODEL):
        self.known = dict(known or {})
        self.ask = ask
        self.threshold = threshold
        self.model = model
        self.stats = Counter()
        self.seconds = 0.0
        self._used: dict[str, float] = {}

    @classmethod
    def from_store(cls, path: Path | None, *, environ=None):
        rows = read_store(path) if path is not None and Path(path).is_file() else []
        key = (os.environ if environ is None else environ).get(KEY_ENV)
        return cls({row['fp']: row['p'] for row in rows}, ask=HttpAsk(key) if key else None)

    # node_tables.py is a converter dependency (its hash is in every saved
    # table's fingerprint), so it never imports this module: it is handed a
    # Recheck and uses only these members.
    unavailable = RecheckUnavailable

    @staticmethod
    def context_index(words, amount_columns=()):
        return ContextIndex(words, amount_columns)

    def fingerprint(self, context: dict) -> str:
        return fingerprint(context, model=self.model, threshold=self.threshold)

    def answers(self, contexts: list[dict], *, required: bool = True) -> list[float | None]:
        """Probability for each context. required: missing answers with no key (or a failed call) raise."""
        fps = [self.fingerprint(c) for c in contexts]
        # Sorted by fingerprint: a probability depends on the other questions in
        # its request, so the same set of questions is always batched the same way.
        missing = dict(sorted({fp: c for fp, c in zip(fps, contexts) if fp not in self.known}.items()))
        self.stats['questions'] += len(fps)
        self.stats['cached'] += len(fps) - len(missing)
        if missing:
            if self.ask is None:
                if required:
                    raise RecheckUnavailable(
                        f'Jev answers missing for {len(missing)} printed digits and {KEY_ENV} is not set; '
                        'ask once with the key to store them beside the manifest')
            else:
                started = time.perf_counter()
                try:
                    got = self.ask(list(missing.values()))
                except Exception:
                    if required:
                        raise
                    got = []
                finally:
                    self.seconds += time.perf_counter() - started
                self.known.update(zip(missing, got))
                self.stats['asked'] += len(got)
        result = [self.known.get(fp) for fp in fps]
        if required:
            self._used.update((fp, p) for fp, p in zip(fps, result))
        return result

    def take_used(self) -> dict[str, float]:
        """Answers returned to required questions since the last call: what a table's check relied on."""
        used, self._used = self._used, {}
        return used

    def summary(self) -> dict:
        usage = getattr(self.ask, 'usage', Counter())
        return {'model': self.model, 'threshold': self.threshold, **self.stats,
                'requests': getattr(self.ask, 'requests', 0),
                'input_tokens': usage.get('input_tokens', 0), 'output_tokens': usage.get('output_tokens', 0),
                'usd': round(usage.get('input_tokens', 0) * USD_PER_INPUT_TOKEN, 6),
                'api_seconds': round(self.seconds, 2)}


def store_header() -> dict:
    return {'kind': 'digit-recheck', 'version': STORE_VERSION, 'model': MODEL, 'threshold': THRESHOLD,
            'instructions': INSTRUCTIONS, 'criteria': CRITERIA}


def read_store(path: Path) -> list[dict]:
    lines = Path(path).read_text().splitlines()
    if not lines:
        raise ValueError(f'Empty digit-recheck store: {path}')
    header = json.loads(lines[0])
    if header.get('kind') != 'digit-recheck' or header.get('version') != STORE_VERSION:
        raise ValueError(f'Unsupported digit-recheck store: {path}')
    rows = []
    for number, line in enumerate(lines[1:], 2):
        row = json.loads(line)
        if (set(row) != {'t', 'fp', 'p'} or not isinstance(row['t'], str) or not isinstance(row['fp'], str)
                or type(row['p']) not in (int, float) or not 0 <= row['p'] <= 1):
            raise ValueError(f'Invalid digit-recheck row {path}:{number}')
        rows.append(row)
    return rows


def merged_rows(existing: list[dict], answers_by_table: dict[str, dict[str, float]]) -> list[dict]:
    """Rows of re-run tables become exactly the answers they used; other tables keep theirs."""
    rows = [row for row in existing if row['t'] not in answers_by_table]
    for table, answers in answers_by_table.items():
        rows.extend({'t': table, 'fp': fp, 'p': round(p, 4)} for fp, p in answers.items())
    return sorted(rows, key=lambda row: (row['t'], row['fp']))


def write_store(path: Path, rows: list[dict]) -> None:
    """Deterministic, so an unchanged answer set leaves no Git diff."""
    path = Path(path)
    text = '\n'.join([json.dumps(store_header(), ensure_ascii=False, sort_keys=True),
                      *(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(',', ':')) for row in rows)])
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(text + '\n')
    os.replace(temporary, path)
