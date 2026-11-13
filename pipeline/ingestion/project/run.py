"""事業についての資料（事業評価の評価シート、予算案のプレス発表）を、出典の PDF から読んで入力準備の表にする。

各行は資料の粒度のまま（評価シート1枚、施策1件）にし、予算書・決算書の事業（内訳）への紐付けは dbt と seed で足す。

評価シートは出典の選定の `evaluation_selections`、予算案のプレス発表は `press_selections` で保存済みの PDF を読む。
どの様式で読むかは `origins.json` の `layout` で決める。
プレス発表は工程ごとのパターンの組み合わせ（`workflow`、`press/`）か、型に収まらない自治体だけ `layout` で読む
（年度ごとに様式が違うことがあるので `years` で年度を絞れる）。読んだ結果は PDF の指紋と読み方のコードの指紋ごとにキャッシュし、
同じ PDF を毎回読み直さない。
"""
from __future__ import annotations

import dataclasses
import hashlib
import importlib
import json
from pathlib import Path

from ingestion.fiscal.storage import fetch
from ingestion.paths import CACHE, PIPELINE
from ingestion.project import press, sheet

HERE = Path(__file__).parent
ORIGINS = HERE / 'origins.json'
SELECTIONS = HERE.parents[1] / 'source_selection'
READINGS = CACHE / 'project'
PAGE_TEXTS = CACHE / 'source-page-text'
# bbox のコード。取り込みと頁の文字のどちらも、直したらキャッシュを読み直す
BBOX_CODE = [PIPELINE / 'ingestion/generic/page_words.py', PIPELINE / 'ingestion/generic/observe.py']
PAGE_TEXT_CODE = [*BBOX_CODE, PIPELINE / 'source_text/layout.py']


def origins() -> dict:
    return json.loads(ORIGINS.read_text(encoding='utf-8'))


def sheet_sources(declared: list[dict], selections: Path = SELECTIONS) -> list[dict]:
    """評価シートの出典。出典の選定で保存済み（`archive` がある）の評価資料だけを、宣言の様式で読む。分冊は1冊ずつ別の出典にする。"""
    out = []
    for entry in declared:
        selection = json.loads((selections / f'{entry["jurisdiction"]}.json').read_text(encoding='utf-8'))
        for item in selection.get('evaluation_selections', []):
            archive = item.get('archive')
            year = item['target']['fiscal_year']
            if not archive or ('years' in entry and year not in entry['years']):
                continue
            candidate = next(c for c in item['candidates'] if c['id'] == archive['candidate_id'])
            for stored in archive['files']:
                url = stored.get('final_url') or next(
                    f['download_url'] for f in candidate['files'] if f['sha256'] == stored['sha256'])
                out.append({'jurisdiction': entry['jurisdiction'], 'fiscal_year': year, 'reader': 'sheet',
                            **({'layout': entry['layout']} if 'layout' in entry else {}),
                            **({'workflow': entry['workflow']} if 'workflow' in entry else {}),
                            'directions': entry.get('directions', {}),
                            'title': candidate['title'], 'landing_url': candidate['landing_url'], 'url': url,
                            'sha256': stored['sha256'], 'reference': {'key': stored['key'], 'sha256': stored['sha256']}})
    return out


def press_sources(declared: list[dict], selections: Path = SELECTIONS) -> list[dict]:
    """予算案のプレス発表の出典。出典の選定で保存済みの資料を、宣言の様式で読む。分冊は1冊ずつ別の出典にする。"""
    out = []
    for entry in declared:
        selection = json.loads((selections / f'{entry["jurisdiction"]}.json').read_text(encoding='utf-8'))
        for item in selection.get('press_selections', []):
            archive = item.get('archive')
            year = item['target']['fiscal_year']
            if not archive or ('years' in entry and year not in entry['years']):
                continue
            candidate = next(c for c in item['candidates'] if c['id'] == archive['candidate_id'])
            for stored in archive['files']:
                url = stored.get('final_url') or next(
                    f['download_url'] for f in candidate['files'] if f['sha256'] == stored['sha256'])
                out.append({'jurisdiction': entry['jurisdiction'], 'fiscal_year': year,
                            **({'layout': entry['layout']} if 'layout' in entry else {}),
                            **({'workflow': entry['workflow']} if 'workflow' in entry else {}),
                            'title': candidate['title'], 'landing_url': candidate['landing_url'], 'url': url,
                            'sha256': stored['sha256'], 'reference': {'key': stored['key'], 'sha256': stored['sha256']}})
    return out


def layout(name: str):
    return importlib.import_module(f'ingestion.project.layouts.{name}')


def code_fingerprint(origin: dict) -> str:
    """読み方の指紋（様式のモジュールか、評価シートの sheet/・プレス発表の組み合わせたパターンと共通の press.py、宣言の workflow）。読み方を直したらキャッシュを読み直す。"""
    workflow = origin.get('workflow')
    if origin.get('reader') == 'sheet':
        files = sheet.modules() if workflow else [Path(layout(origin['layout']).__file__)]
    else:
        files = [*(press.modules(workflow) if workflow else [Path(layout(origin['layout']).__file__)]), HERE / 'layouts' / 'press.py']
    from importlib.metadata import version

    from ingestion.lib import poppler

    # bbox（page_words・observe）と固定した Poppler・pdfplumber の版は、読む経路を問わず効く
    digest = hashlib.sha256(f'{poppler.pinned()} pdfplumber {version("pdfplumber")}'.encode())
    for path in [*files, *BBOX_CODE]:
        digest.update(path.read_bytes())
    if workflow is not None:
        digest.update(json.dumps(workflow, ensure_ascii=False, sort_keys=True).encode())
    return digest.hexdigest()[:16]


def read_cached(path: Path, origin: dict) -> object:
    """PDF を宣言の様式（またはパターンの組み合わせ）で読む。結果は dataclass を dict にしたもの。"""
    name = origin.get('layout', origin.get('reader', 'press'))
    cache = READINGS / f'{origin["sha256"]}-{name}-{code_fingerprint(origin)}.json'
    if cache.exists():
        return json.loads(cache.read_text(encoding='utf-8'))
    if 'workflow' in origin:
        result = (sheet if origin.get('reader') == 'sheet' else press).read(path, origin['workflow'])
    else:
        result = layout(origin['layout']).read(path)
    data = [dataclasses.asdict(r) for r in result]
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    return data


def page_text_fingerprint() -> str:
    """頁の文字の指紋（bbox と並べ方のコード、固定した Poppler の版）。"""
    from ingestion.lib import poppler

    digest = hashlib.sha256(poppler.pinned().encode())
    for path in PAGE_TEXT_CODE:
        digest.update(path.read_bytes())
    return digest.hexdigest()[:16]


def page_texts_cached(path: Path, sha256: str) -> list[str]:
    """アシスタントが読む頁の文字（物理頁の順、文字の無い頁は空文字）。出典の sha256 と指紋ごとにキャッシュする。"""
    cache = PAGE_TEXTS / f'{sha256}-{page_text_fingerprint()}.json'
    if cache.exists():
        return json.loads(cache.read_text(encoding='utf-8'))
    from source_text.layout import page_texts

    texts = page_texts(path)
    cache.parent.mkdir(parents=True, exist_ok=True)
    temporary = cache.with_suffix('.tmp')
    temporary.write_text(json.dumps(texts, ensure_ascii=False), encoding='utf-8')
    os.replace(temporary, cache)
    return texts


def page_text_rows(paths: dict[str, Path]) -> list[tuple]:
    """出典ごとの頁の文字の行。文字が1字も無い出典（スキャン）は行を作らない。キャッシュに無い出典は CPU の数だけ並べて読む。"""
    from concurrent.futures import ProcessPoolExecutor

    items = sorted(paths.items())
    with ProcessPoolExecutor(max_workers=max(1, min(len(items), os.cpu_count() or 1))) as pool:
        read = list(pool.map(page_texts_cached, [p for _, p in items], [s for s, _ in items]))
    rows = []
    for (sha256, _), texts in zip(items, read):
        if any(texts):
            rows.extend((sha256, number, text) for number, text in enumerate(texts, start=1))
    return rows


def thousand(value: int | None) -> int | None:
    return None if value is None else value * 1000


def origin_id(origin: dict) -> str:
    return origin['sha256']


def load(*, remote: bool = False, jurisdictions: set[str] | None = None, page_texts: bool = True) -> dict[str, list[tuple]]:
    """入力準備の表の行。表名 → 行の list。jurisdictions を渡せば、その自治体の資料だけを読む。page_texts が偽なら頁の文字の表は空にする。"""
    declared = origins()
    if jurisdictions:
        declared = {kind: [o for o in entries if o['jurisdiction'] in jurisdictions] for kind, entries in declared.items()}
    tables: dict[str, list[tuple]] = {name: [] for name in (
        'project_origin', 'project_evaluation_sheet', 'project_evaluation_indicator', 'project_evaluation_indicator_value',
        'project_budget_measure', 'project_source_page_text')}
    paths: dict[str, Path] = {}
    for origin in sheet_sources(declared['sheets']):
        path = paths[origin['sha256']] = fetch(origin['reference'], remote=remote)
        sheets = read_cached(path, origin)
        tables['project_origin'].append((origin_id(origin), origin['jurisdiction'], 'sheets', origin['fiscal_year'],
                                            origin['title'], origin['url'], origin['landing_url'], origin['sha256']))
        for item in sheets:
            if 'fiscal_year' in item and item['fiscal_year'] != origin['fiscal_year']:
                raise ValueError(f'評価シートの実施年度が選定と違う: p{item["page"]} {item["fiscal_year"]}')
            # 座標で読む様式（品川）は千円、宣言で読む様式は円で返す
            budget = item['budget_yen'] if 'budget_yen' in item else thousand(item['budget_thousand'])
            settled = item['settled_yen'] if 'settled_yen' in item else thousand(item['settled_thousand'])
            tables['project_evaluation_sheet'].append((
                origin_id(origin), item['page'], item.get('evaluation_year'), item['name'], item['account'],
                item['kan'], item['kou'], item['moku'], item['jigyo'],
                item.get('kan_code'), item.get('kou_code'), item.get('moku_code'), item.get('jigyo_code'),
                item['department'], item['division'], budget, settled,
                item['grade_label'], item['direction'],
                # 方向性の欄が無い様式は、評価の区分の印字（多くは今後の方向性）から当てる
                sheet.direction_code(item['direction'] or item['grade_label'], origin['directions'])))
            for indicator in item['indicators']:
                tables['project_evaluation_indicator'].append((
                    origin_id(origin), item['page'], indicator['position'], indicator['name'], indicator['unit'],
                    indicator['definition'], indicator['targets'].get('target'), indicator['target_year_text']))
                years = sorted({k for k in (*indicator['targets'], *indicator['actuals']) if k != 'target'})
                for year in years:
                    tables['project_evaluation_indicator_value'].append((
                        origin_id(origin), item['page'], indicator['position'], int(year),
                        indicator['targets'].get(year), indicator['actuals'].get(year)))
    for origin in press_sources(declared['press']):
        path = paths[origin['sha256']] = fetch(origin['reference'], remote=remote)
        items = read_cached(path, origin)
        tables['project_origin'].append((origin_id(origin), origin['jurisdiction'], 'press', origin['fiscal_year'],
                                            origin['title'], origin['url'], origin['landing_url'], origin['sha256']))
        for item in items:
            tables['project_budget_measure'].append((
                origin_id(origin), item['page'], item.get('position', 1), item['title'], json.dumps(item['names'], ensure_ascii=False),
                item['is_new'], item['budget_thousand'], json.dumps(item['points'], ensure_ascii=False)))
    if page_texts:
        tables['project_source_page_text'] = page_text_rows(paths)
    return tables


SCHEMAS = {
    'project_origin': 'origin_id varchar, jurisdiction_code varchar, document_type varchar, fiscal_year integer, '
                         'title varchar, url varchar, landing_url varchar, sha256 varchar',
    'project_evaluation_sheet': 'origin_id varchar, page integer, evaluation_year integer, name varchar, account_name varchar, '
                        'kan varchar, kou varchar, moku varchar, jigyo varchar, '
                        'kan_code varchar, kou_code varchar, moku_code varchar, jigyo_code varchar, '
                        'department varchar, division varchar, budget_yen bigint, settled_yen bigint, '
                        'grade_label varchar, direction varchar, direction_code varchar',
    'project_evaluation_indicator': 'origin_id varchar, page integer, position integer, name varchar, unit varchar, '
                            'definition varchar, final_target_text varchar, final_target_year_text varchar',
    'project_evaluation_indicator_value': 'origin_id varchar, page integer, position integer, fiscal_year integer, '
                                  'target_text varchar, actual_text varchar',
    'project_budget_measure': 'origin_id varchar, page integer, position integer, title varchar, names varchar, is_new boolean, '
                  'budget_thousand bigint, points varchar',
    'project_source_page_text': 'sha256 varchar, page integer, text varchar',
}


def write(con, tables: dict[str, list[tuple]]) -> None:
    for name, schema in SCHEMAS.items():
        con.execute(f'create or replace table ingestion.{name} ({schema})')
        rows = tables[name]
        if rows:
            con.executemany(f'insert into ingestion.{name} values ({",".join("?" * len(rows[0]))})', rows)
