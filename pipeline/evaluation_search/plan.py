"""評価資料の索引の計画。選定（`source_selection/<団体>.json` の `evaluation_selections`）と `instance.json` の設定から、
原典ごとの item（頁ごとの PDF）の key と metadata を決める。ネットワークも PDF も読まない。

設計は docs/prd/evaluation-search/dd.md。登録の script は `index.py`、Worker が引く catalog の生成は `serving/evaluation_catalog.py`。
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

PIPELINE = Path(__file__).resolve().parents[1]
SELECTION_DIR = PIPELINE / 'source_selection'
INSTANCE_PATH = Path(__file__).with_name('instance.json')
# OCR なしの PDF は 1 ファイル 4MiB まで（AI Search の上限）
MAX_ITEM_BYTES = 4 * 1024 * 1024


@dataclass(frozen=True)
class Origin:
    """登録する評価資料の原典 1 ファイル。R2 に保存済みで、選定の sha256 と保存の記録が一致するものだけ。"""

    jurisdiction: str
    fiscal_year: int
    sha256: str
    bucket: str
    r2_key: str
    title: str
    landing_url: str
    download_url: str
    # 選定の pages。None は全頁
    pages: tuple[tuple[int, int], ...] | None


def load_origins(selection_dir: Path = SELECTION_DIR, *, use_ocr: bool = False) -> list[Origin]:
    """保存済みの評価資料を団体・評価対象年度・選定の files の順に返す。保存の記録が無い選定は含めない。

    OCR なしのインスタンス（`use_ocr: false`）には選定の `pdf_type: text` のファイルだけ、OCR ありには `scan` だけを返す。
    scan を文字の層の無いまま登録しないための関門で、選定の判断だけに頼らない（dd.md「拡大の条件」）。
    """
    pdf_type = 'scan' if use_ocr else 'text'
    origins: list[Origin] = []
    for path in sorted(selection_dir.glob('*.json')):
        document = json.loads(path.read_text(encoding='utf-8'))
        for selection in document.get('evaluation_selections') or []:
            archive = selection.get('archive')
            if not archive or selection.get('selected_candidate_id') is None:
                continue
            candidate = next((c for c in selection['candidates'] if c['id'] == selection['selected_candidate_id']), None)
            if candidate is None:
                raise ValueError(f'{path.name}: 選定の候補 {selection["selected_candidate_id"]} が candidates に無い')
            if len(candidate['files']) != len(archive['files']):
                raise ValueError(f'{path.name}: 選定の files と保存の files の数が違う')
            target = selection['target']
            for file, saved in zip(candidate['files'], archive['files']):
                if file['sha256'] != saved['sha256']:
                    raise ValueError(f'{path.name}: 選定と保存の sha256 が違う: {saved["key"]}')
                if file['pdf_type'] not in ('text', 'scan'):
                    raise ValueError(f'{path.name}: pdf_type が text でも scan でもない: {file["pdf_type"]}')
                if file['pdf_type'] != pdf_type:
                    continue
                pages = file['pages']
                origins.append(Origin(
                    jurisdiction=target['jurisdiction'], fiscal_year=target['fiscal_year'], sha256=file['sha256'],
                    bucket=archive['bucket'], r2_key=saved['key'], title=candidate['title'],
                    landing_url=candidate['landing_url'], download_url=file['download_url'],
                    pages=None if pages is None else tuple((r['start'], r['end']) for r in pages)))
    hashes = [o.sha256 for o in origins]
    if len(set(hashes)) != len(hashes):
        raise ValueError('同じ sha256 の原典が複数の選定にある')
    return sorted(origins, key=lambda o: (o.jurisdiction, o.fiscal_year))  # 同じ対象の中は選定の files の順のまま


def load_instance(path: Path = INSTANCE_PATH) -> dict:
    return json.loads(path.read_text(encoding='utf-8'))


def render_instance(instance: dict) -> str:
    return json.dumps(instance, ensure_ascii=False, indent=2) + '\n'


def selected_pages(origin: Origin, page_count: int) -> list[int]:
    """索引に入れる物理頁（1 始まり）。選定が null なら全頁。原典の頁数を超える範囲は止める。"""
    if origin.pages is None:
        return list(range(1, page_count + 1))
    for start, end in origin.pages:
        if not 1 <= start <= end <= page_count:
            raise ValueError(f'{origin.sha256[:12]}: 選定の頁範囲 {start}-{end} が 1 <= 始点 <= 終点 <= 原典の頁数 {page_count} を満たさない')
    return [page for start, end in origin.pages for page in range(start, end + 1)]


def item_key(origin: Origin, page: int) -> str:
    """item の key。cf の upload は key をファイル名の末尾（basename）にするので、`/` で区切れない。`_` で原典の sha256 と頁をつなぐ。"""
    return f'{origin.sha256}_p{page:04d}.pdf'


def item_metadata(origin: Origin, page: int) -> dict:
    """custom metadata の値。`fiscal_year` は text。`page` は number だが、upload は文字列の数字で送り number に変換される。"""
    return {'jurisdiction': origin.jurisdiction, 'fiscal_year': str(origin.fiscal_year),
            'origin_sha256': origin.sha256, 'page': page}


def plan_items(origin: Origin, page_count: int) -> list[dict]:
    return [{'key': item_key(origin, page), 'metadata': item_metadata(origin, page)}
            for page in selected_pages(origin, page_count)]


def fingerprint(config: dict, items: list[dict]) -> str:
    """インスタンスの設定と、その原典の key・metadata の計画から求めるハッシュ。"""
    body = json.dumps({'config': config, 'items': items}, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(body.encode('utf-8')).hexdigest()


def registration(instance: dict, origin: Origin) -> dict | None:
    return next((r for r in instance['registrations'] if r['origin_sha256'] == origin.sha256), None)


def registration_is_current(instance: dict, origin: Origin) -> bool:
    """登録の記録があり、その頁数から求めた計画の指紋が今の選定と設定で変わっていない。"""
    record = registration(instance, origin)
    if record is None:
        return False
    try:
        items = plan_items(origin, record['page_count'])
    except ValueError:
        return False
    return fingerprint(instance['config'], items) == record['plan_fingerprint']
