"""Variant B: Jev (TypeSafe System One) chooses the role of codeless remark lines.

The rule tree decides codeless lines by geometry (wrap when the amount sits in
the column of the amountless item above, amount kinds by vocabulary, notes by
vocabulary). This variant asks one Choice per codeless line instead, with the
lines of the same block as state: text, indentation and amount column in
characters. Codes, cells, subject rows and amounts stay rule-decided.

The model is pinned for reproducibility. Answers are cached on disk by request
hash so reruns cost nothing. The key comes from `TYPESAFE_API_KEY` or the
user's mise (age-encrypted); it is never written anywhere.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request

MODEL = 'jev-1.13.0'
ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
PRICE_PER_TOKEN = 0.042 / 1_000_000
ROLES = {
    'item': '新しい項目の始まり。事業・節・細目などの名前で、多くは金額を伴う',
    'continuation': '直前の項目の名前が長くて折り返した続き（【所管課】や括弧書きを含む）。金額があれば直前の項目の金額である',
    'amount_kind': '直前の項目の金額の種類の見出しと金額（繰越明許費・不用額・支出済額・本年度支出額など）。新しい項目ではない',
    'note': '注記・参照・流用や予備費の支出の記録など、項目でも直前の項目の金額でもない行',
}


def api_key() -> str:
    if os.environ.get('TYPESAFE_API_KEY'):
        return os.environ['TYPESAFE_API_KEY']
    env = dict(os.environ)
    if not env.get('MISE_AGE_KEY'):
        env['MISE_AGE_KEY'] = subprocess.run(
            ['security', 'find-generic-password', '-a', os.environ.get('USER', ''), '-s', 'mise-age-key', '-w'],
            capture_output=True, text=True).stdout.strip()
    result = subprocess.run(['mise', 'env', '--json'], capture_output=True, text=True, env=env, cwd=str(Path.home()))
    return json.loads(result.stdout or '{}')['TYPESAFE_API_KEY']


class Client:
    def __init__(self, cache: Path):
        self.cache_path = cache
        self.cache = json.loads(cache.read_text()) if cache.exists() else {}
        self.key: str | None = None
        self.input_tokens = 0
        self.requests = 0
        self.seconds = 0.0

    def ask(self, state, questions: dict) -> dict:
        body = {'state': state, 'model': MODEL, 'questions': questions}
        digest = hashlib.sha256(json.dumps(body, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        if digest in self.cache:
            return self.cache[digest]['answers']
        self.key = self.key or api_key()
        data = json.dumps(body).encode()
        started = time.time()
        for attempt in range(6):
            request = urllib.request.Request(ENDPOINT, data=data, method='POST', headers={
                'Content-Type': 'application/json', 'Authorization': f'Bearer {self.key}'})
            try:
                with urllib.request.urlopen(request, timeout=180) as response:
                    payload = json.loads(response.read())
                break
            except urllib.error.HTTPError as error:
                if error.code in (429, 500, 502, 503, 529) and attempt < 5:
                    time.sleep(2 ** attempt); continue
                raise RuntimeError(f'Jev HTTP {error.code}: {error.read()[:300]!r}')
        self.seconds += time.time() - started
        self.requests += 1
        tokens = payload.get('usage', {}).get('input_tokens', 0)
        self.input_tokens += tokens
        self.cache[digest] = {'answers': payload['answers'], 'input_tokens': tokens}
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self.cache_path.write_text(json.dumps(self.cache, ensure_ascii=False))
        return payload['answers']

    @property
    def cost(self) -> float:
        return self.input_tokens * PRICE_PER_TOKEN


def line_roles(client: Client, lines: list[dict]) -> dict[str, tuple[str, float]]:
    """Role of each codeless line of one block. `lines` carry id, text, indent, amount, amount_inset, code."""
    asked = [line['id'] for line in lines if line['code'] is None]
    if not asked:
        return {}
    state = {
        'document': '日本の市区町村の歳出決算書（事項別明細書）の備考・説明欄の一つの区画。行は印字の順。'
                    'indent は区画の左端から何文字分右に字下げしているか、amount_inset は金額の右端が欄の右端から'
                    '何文字分内側か（項目の段が深いほど内側になる）、code は行頭の番号。',
        'lines': {line['id']: {k: line[k] for k in ('text', 'indent', 'amount', 'amount_inset', 'code')} for line in lines},
    }
    answers = {}
    for start in range(0, len(asked), 120):
        questions = {line_id: {
            'type': 'choice',
            'instructions': f'行 `lines.{line_id}` は、この説明欄の木で何の役割か。前後の行との字下げ・金額の位置・語の意味の関係から判断する。',
            'criteria': ROLES} for line_id in asked[start:start + 120]}
        for line_id, answer in client.ask(state, questions).items():
            answers[line_id] = (answer['choice'], answer.get('confidence', 0.0))
    return answers
