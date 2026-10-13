"""試行のスクリプトが共有する定数と、AI Search の呼び出し。"""
import json, re, subprocess

INST = 'fudoki-eval-trial-v1'
# AI Search が PDF を Markdown にしたときの頁の見出し。OCR なしは `### Page N`、OCR ありは `<!-- page N -->`。
PAGE_MARK = re.compile(r'(?:^|\n)(?:### Page (\d+)|<!-- page (\d+) -->)\n?')


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
    """全 chunk の id → {pages: 含む（原典・頁）, lead: 頁の見出しより前の文の（原典・頁）, doc: 資料の種類}。

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
                            'doc': it['metadata'].get('document')}
    return idx
