"""Worker が引く評価資料の一覧 `apps/api/src/evaluation-catalog.json` の生成器（dd.md「Worker が使う原典の一覧」）。

選定の評価資料のうち、`evaluation_search/instance.json` に登録の記録があり、記録の指紋が今の選定と設定から求めた指紋と
一致する原典だけを載せる。選定や索引の設定だけが先に変わった原典を「収録済み」として検索させないため。

    bun run --cwd pipeline serving:evaluation-catalog           # evaluation-catalog.json を書き直す
    bun run --cwd pipeline serving:evaluation-catalog --check   # 最新かだけ検査する
"""
from __future__ import annotations

import argparse
import json
import sys

from evaluation_search import plan

OUTPUT = plan.PIPELINE.parent / 'apps/api/src/evaluation-catalog.json'


def build(origins: list[plan.Origin], instance: dict) -> dict:
    documents = []
    for origin in origins:
        if not plan.registration_is_current(instance, origin):
            continue
        page_count = plan.registration(instance, origin)['page_count']
        ranges = origin.pages if origin.pages is not None else ((1, page_count),)
        documents.append({
            'origin_sha256': origin.sha256,
            'jurisdiction': origin.jurisdiction,
            'fiscal_year': origin.fiscal_year,
            'title': origin.title,
            'url': origin.download_url,
            'landing_url': origin.landing_url,
            'pages': [{'start': start, 'end': end} for start, end in ranges],
        })
    return {'instance': instance['config']['name'], 'documents': documents}


def render(origins: list[plan.Origin] | None = None, instance: dict | None = None) -> str:
    instance = plan.load_instance() if instance is None else instance
    catalog = build(plan.load_origins(use_ocr=instance['config']['use_ocr']) if origins is None else origins, instance)
    return json.dumps(catalog, ensure_ascii=False, indent=2) + '\n'


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--check', action='store_true', help='書かずに、evaluation-catalog.json が最新か検査する')
    args = parser.parse_args()
    text = render()
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding='utf-8') != text:
            print(f'{OUTPUT} が古い。serving:evaluation-catalog で書き直す', file=sys.stderr)
            return 1
        return 0
    OUTPUT.write_text(text, encoding='utf-8')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
