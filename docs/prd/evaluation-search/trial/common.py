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


def search(query, jurisdiction):
    """団体で絞って上位10件の chunk を返す。失敗を0件と取り違えないよう、cf の失敗は例外にする。

    年度（number の custom metadata）でも絞ると、語の一致（BM25）の側が毎回0件になる（2026-10-13 観測）。
    試行の資料は2025年度だけなので、年度では絞らない。
    """
    body = {'messages': [{'role': 'user', 'content': query}], 'ai_search_options': {'retrieval': {
        'filters': {'jurisdiction': jurisdiction},
        'max_num_results': 10, 'score_threshold': 0, 'keyword_match_mode': 'or'}}}
    return cf('search', INST, query, '--body', json.dumps(body, ensure_ascii=False)).get('chunks', [])


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
