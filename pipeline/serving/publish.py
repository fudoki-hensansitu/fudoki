"""変わったところだけを marts に build して、D1 へ差分で写す（serving:sync の入口。CI の sync-d1.yml もこれを呼ぶ）。

    bun run --cwd pipeline publish -- --database-id <uuid> [--since <commit>] [--dry-run]
    ... --all                              # 全件を build して同期する
    ... --jurisdiction 131016 [...]        # その自治体を指定して流す
    ... --local                            # ローカルの D1 に写す

既定は `--since`（省略時は origin/main と HEAD の分岐点）から HEAD までの差分で範囲を決める。
- 取り込みの宣言・出典の選定・1列目が自治体コードの seed の行だけが変わった → その自治体だけ
  （build と sync に同じ `--jurisdiction` を渡す。他の自治体の行は消さない）
- dbt のモデル・共通の辞書・配信のコードなど、全自治体に効くものが変わった → 全件
- marts に効く変更が無い → 何もしない
迷うものは全件に倒す（同期は D1 との差分しか書かないので、広く流しても書き込みは増えない）。
自治体で絞った build は生成 macro `fiscal_*_relations.sql` を書き換えるので、終わったら元に戻す。
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


RELATIONS = ('pipeline/dbt/macros/fiscal_csv_relations.sql', 'pipeline/dbt/macros/fiscal_pdf_relations.sql')


def run(*command: str) -> None:
    print('$', ' '.join(command), flush=True)
    subprocess.run(command, cwd=ROOT / 'pipeline', check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument('--database-id', help='D1 の database id')
    target.add_argument('--local', action='store_true', help='ローカルの D1（miniflare）に写す')
    which = parser.add_mutually_exclusive_group()
    which.add_argument('--since', help='この commit から HEAD までの差分で範囲を決める（既定: origin/main との分岐点）')
    which.add_argument('--all', action='store_true', help='全件を build して同期する')
    which.add_argument('--jurisdiction', action='append', metavar='CODE', help='その自治体を流す（複数指定可）')
    parser.add_argument('--dry-run', action='store_true', help='D1 に書かず、書く予定の行数を出す（build はする）')
    args = parser.parse_args()

    if args.all:
        found = {'mode': 'full', 'jurisdictions': []}
    elif args.jurisdiction:
        if bad := [c for c in args.jurisdiction if not re.fullmatch(r'\d{6}', c)]:
            parser.error(f'not a jurisdiction code: {bad}')
        found = {'mode': 'jurisdictions', 'jurisdictions': sorted(set(args.jurisdiction))}
    else:
        base = args.since or git('merge-base', 'origin/main', 'HEAD').strip()
        found = scope(base, 'HEAD')
    print(json.dumps(found, ensure_ascii=False), flush=True)
    if found['mode'] == 'none':
        return
    scoped = [a for code in found['jurisdictions'] for a in ('--jurisdiction', code)]
    dirty = bool(git('status', '--porcelain', '--', *RELATIONS).strip())
    try:
        run('uv', 'run', 'python', 'dbt/scripts/prepare.py', '--build', '--remote', *scoped)
        run('uv', 'run', 'python', '-m', 'serving.sync_d1',
            *(['--local'] if args.local else ['--database-id', args.database_id]),
            *scoped, *(['--dry-run'] if args.dry_run else []))
    finally:
        if scoped and not dirty:
            git('checkout', '--', *RELATIONS)


if __name__ == '__main__':
    main()
