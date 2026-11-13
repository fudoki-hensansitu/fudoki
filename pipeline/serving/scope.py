"""main に入った変更から、D1 へ写し直す範囲を決める（.github/workflows/sync-d1.yml が使う）。

    uv run python -m serving.scope --base <commit> --head <commit>

出力は JSON 1行: {"mode": "none" | "jurisdictions" | "full", "jurisdictions": [...]}
- jurisdictions: 取り込みの宣言・出典の選定・自治体の列を持つ seed の行だけが変わった。その自治体だけを build して
  `serving:sync --jurisdiction` で流す（他の自治体の行には触れない）
- full: dbt のモデル・共通の辞書・配信のコードなど、全自治体に効くものが変わった。全件で build して差分で同期する
- none: marts に効く変更が無い
迷うものは full に倒す（同期は D1 との差分しか書かないので、広く流しても書き込みは増えない）。
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# 自治体の取り込みの宣言（管理 JSON）と出典の選定。保存し直した表は管理 JSON の変更として現れる
JURISDICTION_PATHS = (
    re.compile(r'^pipeline/ingestion/fiscal/jurisdictions/(\d{6})/\d{4}/.+\.json$'),
    re.compile(r'^pipeline/source_selection/(\d{6})\.json$'),
)
# 1列目が自治体コードの seed。変わった行の自治体だけを流す
JURISDICTION_SEEDS = re.compile(r'^pipeline/dbt/seeds/.+\.csv$')
# 管理 JSON から生成するもの・marts に効かないもの
IGNORED = (
    re.compile(r'\.md$'),
    re.compile(r'(^|/)[^/]*_test\.py$'),
    re.compile(r'\.test\.ts$'),
    re.compile(r'\.digit-recheck\.jsonl$'),
    re.compile(r'^pipeline/dbt/models/staging/fiscal/_sources\.yml$'),
    re.compile(r'^pipeline/dbt/macros/fiscal_(csv|pdf)_relations\.sql$'),
    # 取り込みのコードは表を作るだけ。表が変われば管理 JSON が変わる
    re.compile(r'^pipeline/ingestion/fiscal/'),
)
# 全自治体に効くもの
FULL_PATHS = (
    re.compile(r'^pipeline/(dbt|shared|serving|source_text|ingestion)/'),
    re.compile(r'^packages/(jurisdictions|fiscal)/'),
    re.compile(r'^apps/api/src/columns\.json$'),
    re.compile(r'^(uv\.lock|pyproject\.toml|pipeline/pyproject\.toml|mise\.toml)$'),
)


def git(*args: str) -> str:
    return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout


def seed_jurisdictions(base: str, head: str, path: str) -> set[str] | None:
    """seed の変わった行の自治体コード。1列目が自治体コードでない seed は None（全件）。"""
    header = git('show', f'{head}:{path}').splitlines()[:1] if path_exists(head, path) else \
        git('show', f'{base}:{path}').splitlines()[:1]
    if not header or not header[0].startswith('jurisdiction_code,'):
        return None
    codes = set()
    for line in git('diff', '--unified=0', base, head, '--', path).splitlines():
        if line[:1] in '+-' and not line.startswith(('+++', '---')):
            code = line[1:].split(',', 1)[0]
            if not re.fullmatch(r'\d{6}', code):
                return None
            codes.add(code)
    return codes


def path_exists(ref: str, path: str) -> bool:
    return subprocess.run(['git', 'cat-file', '-e', f'{ref}:{path}'], cwd=ROOT, capture_output=True).returncode == 0


def scope(base: str, head: str) -> dict:
    jurisdictions: set[str] = set()
    for path in git('diff', '--name-only', base, head).splitlines():
        if JURISDICTION_SEEDS.match(path):
            codes = seed_jurisdictions(base, head, path)
            if codes is None:
                return {'mode': 'full', 'jurisdictions': [], 'reason': path}
            jurisdictions |= codes
            continue
        match = next((m for p in JURISDICTION_PATHS if (m := p.match(path))), None)
        if match:
            jurisdictions.add(match.group(1))
            continue
        if any(p.search(path) for p in IGNORED):
            continue
        if any(p.match(path) for p in FULL_PATHS):
            return {'mode': 'full', 'jurisdictions': [], 'reason': path}
    if not jurisdictions:
        return {'mode': 'none', 'jurisdictions': []}
    return {'mode': 'jurisdictions', 'jurisdictions': sorted(jurisdictions)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--base', required=True)
    parser.add_argument('--head', required=True)
    args = parser.parse_args()
    print(json.dumps(scope(args.base, args.head), ensure_ascii=False))


if __name__ == '__main__':
    main()
