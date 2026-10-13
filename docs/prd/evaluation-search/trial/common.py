"""試行のスクリプトが共有する定数と、AI Search の呼び出し。"""
import json, os, re, subprocess

INST = 'fudoki-eval-trial-v1'
QUOTE_LABELS = ('正しい', '別の事業の行', '別の年度・列', '別の項目', '原典に無い', '判断できない')
# AI Search が PDF を Markdown にしたときの頁の見出し。OCR なしは `### Page N`、OCR ありは `<!-- page N -->`。
PAGE_MARK = re.compile(r'(?:^|\n)(?:### Page (\d+)|<!-- page (\d+) -->)\n?')


def usage_limited(result):
    text = str(result.get('result', '')) + str(result.get('error', ''))
    return any(s in text.lower() for s in ('hit your session limit', 'hit your usage limit', 'usage limit reached'))


def attempt_results(work, qid):
    paths = [f'{work}/agent/{qid}.run.json']
    directory = f'{work}/agent/attempts/{qid}'
    if os.path.isdir(directory):
        paths += [f'{directory}/{p}' for p in sorted(os.listdir(directory)) if p.endswith('.run.json')]
    return [json.load(open(p)) for p in paths if os.path.exists(p)]


def classify_answer(q, answer, page_judgments=None, page_overrides=None):
    """固定した採点規則。未判定の候補頁は誤りとも正答とも決めない。"""
    truth, accept = set(q['truth']), set(q['accept'])
    selected = set(answer.get('pages', [])) if answer else set()
    added, pending = set(), set()
    status = answer.get('status') if answer else None
    if q['set'] == 'S5-undetermined':
        cls = '採点対象外'
    else:
        if status == 'found':
            for pid in selected - accept:
                key = f'{q["id"]}|{pid}'
                verdict = (page_overrides or {}).get(key, (page_judgments or {}).get(pid, {}).get('contains'))
                if verdict is True:
                    added.add(pid)
                elif verdict is not False:
                    pending.add(pid)
        allowed = accept | added
        if not status:
            cls = '回答なし'
        elif pending:
            cls = '判定待ち'
        elif not allowed:
            cls = {'not_found': '正答', 'found': '取り違え', 'ambiguous': '曖昧'}[status]
        elif status == 'found':
            if selected - allowed or not selected & (truth or allowed):
                cls = '取り違え'
            else:
                cls = '部分' if q['set'] == 'S4a' and not truth <= selected else '正答'
        else:
            cls = {'not_found': '該当なし', 'ambiguous': '曖昧'}[status]
    return {'class': cls, 'accept': accept | added, 'added': added, 'pending': pending,
            'negative': not (accept | added), 'neg_reclassified': not accept and bool(added),
            'quote_eligible': cls == '正答' and status == 'found'}


def quote_items(answer):
    """回答された引用だけ。null の項目は分母に含めない。"""
    return [{'field': field, 'page': value.get('page'), 'quote': value.get('quote'), 'reading': value.get('reading')}
            for project in answer.get('projects', [])
            for field, value in (project.get('fields') or {}).items() if value]


def returned_page_text(log, index):
    """その問いの検索が返した chunk だけから頁の本文を復元する。"""
    chunks = {cid for row in log if row['kind'] == 'search' for cid in row['chunks']}
    result = {}
    for cid in sorted(chunks, key=lambda cid: (index[cid]['item'], index[cid]['start'])):
        chunk = index[cid]
        for page, body in split_pages(chunk['text']):
            pid = chunk['lead'] if page is None else f"{chunk['sha']}:{page + chunk['offset']}"
            if pid:
                result[pid] = result.get(pid, '') + re.sub(r'\s+', '', body)
    return result


def cf(*args):
    r = subprocess.run(['cf', 'ai-search', *args, '--name', 'default'], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f'cf ai-search {args[0]} failed: {r.stderr.strip()[:300]}')
    return json.loads(r.stdout)


def search(query, jurisdiction, retrieval_type='hybrid', meta=None):
    """団体で絞って上位10件の chunk を返す。失敗を0件と取り違えないよう、cf の失敗は例外にする。

    retrieval_type は hybrid（既定）・keyword（全文検索だけ）・vector。meta に dict を渡すと hybrid_meta を入れて返す。

    年度（number の custom metadata）でも絞ると、語の一致（BM25）の側が毎回0件になる（2026-10-13 観測）。
    試行の資料は2025年度だけなので、年度では絞らない。
    """
    body = {'messages': [{'role': 'user', 'content': query}], 'ai_search_options': {'retrieval': {
        'filters': {'jurisdiction': jurisdiction},
        'max_num_results': 10, 'score_threshold': 0, 'keyword_match_mode': 'or', 'retrieval_type': retrieval_type}}}
    r = cf('search', INST, query, '--body', json.dumps(body, ensure_ascii=False))
    if meta is not None:
        meta.update(r.get('hybrid_meta') or {})
    return r.get('chunks', [])


def page_id(item_metadata, page):
    """本冊と別冊で頁番号が重なるので、原典の sha256 の先頭12桁と物理頁を組にする。"""
    return f"{item_metadata['origin_sha256'][:12]}:{page + int(item_metadata.get('page_offset', 0))}"


def split_pages(text):
    """chunk の本文を（頁番号, その頁の文）に分ける。頁の見出しより前の文は (None, 文)。"""
    parts = PAGE_MARK.split(text)
    out = [(None, parts[0])] if parts[0].strip() else []
    for i in range(1, len(parts), 3):
        out.append((int(parts[i] or parts[i + 1]), parts[i + 2]))
    return out


def chunk_index():
    """全 chunk の id → {pages: 含む（原典・頁）, lead: 頁の見出しより前の文の（原典・頁）, doc: 資料の種類, item・start・sha・offset・text}。

    見出しより前の文は、同じファイルの直前の chunk の最後の頁の続きとして扱う。
    """
    idx = {}
    for it in cf('items', 'list', '--id', INST):
        chunks, offset = [], 0
        while True:  # chunks の一覧は既定20件のページ送り
            page = cf('items', 'chunks', it['id'], '--id', INST, '--limit', '50', '--offset', str(offset))
            chunks += page; offset += len(page)
            if len(page) < 50:
                break
        assert len(chunks) == it['chunks_count'], (it['key'], len(chunks), it['chunks_count'])
        last = None
        for c in sorted(chunks, key=lambda c: c['start_byte']):
            lead, pages = (page_id(it['metadata'], last) if last else None), set()
            for p, _ in split_pages(c['text']):
                pages.add(p if p is not None else last)
                if p is not None:
                    last = p
            idx[c['id']] = {'pages': sorted(page_id(it['metadata'], p) for p in pages if p), 'lead': lead,
                            'doc': it['metadata'].get('document'), 'item': it['key'], 'start': c['start_byte'],
                            'sha': it['metadata']['origin_sha256'][:12], 'offset': int(it['metadata'].get('page_offset', 0)), 'text': c['text']}
    return idx
