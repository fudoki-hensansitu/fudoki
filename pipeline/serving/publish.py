"""変わったところだけを marts に build して、D1 へ差分で写す（serving:sync の入口。CI の sync-d1.yml もこれを呼ぶ）。

    bun run --cwd pipeline publish -- --database-id <uuid> [--since <commit>] [--dry-run]
    ... --dry-run（D1 を指定しない）             # build して、D1 を読まずに表ごとの行数だけ出す（PR の check）
    ... --all                              # 全件を build して同期する
    ... --jurisdiction 131016 [...]        # その自治体を指定して流す
    ... --local                            # ローカルの D1 に写す
    ... --snapshot <file> [--verify-all]   # 前回の同期の写しと比べて D1 を全行は読まない（serving/sync_d1.py）

既定は `--since`（省略時は origin/main と HEAD の分岐点）から HEAD までの差分で範囲を決める。
- 取り込みの宣言・出典の選定・1列目が自治体コードの seed の行だけが変わった → その自治体だけ
  （build と sync に同じ `--jurisdiction` を渡す。他の自治体の行は消さない）
- それ以外の marts の入力（dbt のモデル・共通の辞書・build と配信のコードなど）が変わった → 全件
- 取り込みのコードのうち build が import しないもの（変換器・保存・refresh）と変換器の宣言 → 見ない。
  build は R2 に保存済みの表を読むので、変換器を変えても marts は変わらない。表が変わるときは管理 JSON の記録が変わる
- marts の入力が変わっていない（web・docs だけ、文書・テストだけなど） → 何もしない
自治体に絞れると分かるもの以外は全件に倒す（同期は D1 との差分しか書かないので、広く流しても書き込みは増えない）。
自治体で絞った build は生成 macro `fiscal_*_relations.sql` を書き換えるので、終わったら元に戻す。
"""
import argparse
import ast
import json
import re
import subprocess
from collections.abc import Callable
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PIPELINE = ROOT / 'pipeline'

# marts の入力になるもの。これ以外（web・docs・CI の設定など）は見ない
INPUTS = (
    re.compile(r'^pipeline/'),
    re.compile(r'^packages/(jurisdictions|fiscal)/'),
    re.compile(r'^apps/api/src/columns\.json$'),
    re.compile(r'^(uv\.lock|pyproject\.toml|mise\.toml)$'),
)
# 入力の中で marts に効かないもの・build が管理 JSON から生成するもの
IGNORED = (
    re.compile(r'\.md$'),
    re.compile(r'(^|/)[^/]*_test\.py$'),
    re.compile(r'\.test\.ts$'),
    re.compile(r'\.digit-recheck\.jsonl$'),
    re.compile(r'^pipeline/dbt/macros/fiscal_(csv|pdf)_relations\.sql$'),
)
# build と同期の入口。ingestion/project は様式を名前で import する（importlib）ので丸ごと入口にする
BUILD_ENTRIES = ('dbt/scripts/prepare.py', 'dbt/scripts/fiscal_inputs.py', 'serving/publish.py', 'serving/sync_d1.py',
                 'serving/columns.py')
BUILD_PACKAGES = ('dbt/models', 'ingestion/project')
# 関数の中の import を追わない module。manifest は変換器の検査（check_code）と指紋のときだけ、storage は保存の検査
# （prepare_save）のときだけ変換器と木の検査を import する。build（prepare.py）は check_code=False で読み、fetch・verify だけを使う
TOP_LEVEL_ONLY = ('ingestion/fiscal/manifest.py', 'ingestion/fiscal/storage.py')
# import の解決先（prepare.py は dbt/scripts の fiscal_inputs を import する）
MODULE_ROOTS = (PIPELINE, PIPELINE / 'dbt/scripts')
# build が import しない取り込みのコードはこの下で探す。ここに無い Python は今までどおり入力とみなす
INGESTION = re.compile(r'^pipeline/ingestion/.+\.py$')
# 変換器の宣言（options の schema・pattern の目録など。Python 以外）。変換にだけ効き、build は読まない
CONVERTER_DATA = (
    re.compile(r'^pipeline/ingestion/fiscal/layouts/'),
    re.compile(r'^pipeline/ingestion/generic/patterns/'),
)
# 自治体の取り込みの宣言（管理 JSON）と出典の選定。保存し直した表は管理 JSON の変更として現れる
JURISDICTION_PATHS = (
    re.compile(r'^pipeline/ingestion/fiscal/jurisdictions/(\d{6})/\d{4}/.+\.json$'),
    re.compile(r'^pipeline/source_selection/(\d{6})\.json$'),
)
# 1列目が自治体コードの seed。変わった行の自治体だけを流す
SEEDS = re.compile(r'^pipeline/dbt/seeds/.+\.csv$')
CODE = re.compile(r'\d{6}')


def module_file(name: str) -> Path | None:
    for root in MODULE_ROOTS:
        path = root.joinpath(*name.split('.'))
        for candidate in (path.with_suffix('.py'), path / '__init__.py'):
            if candidate.is_file():
                return candidate
    return None


def imported(path: Path) -> list[str]:
    """path が import する名前。関数の中の import も数える（TOP_LEVEL_ONLY を除く）。"""
    tree = ast.parse(path.read_text(encoding='utf-8'))
    names = []
    top = str(path.relative_to(PIPELINE)) in TOP_LEVEL_ONLY
    for node in tree.body if top else ast.walk(tree):
        if isinstance(node, ast.Import):
            names += [alias.name for alias in node.names]
        elif isinstance(node, ast.ImportFrom) and node.module and not node.level:
            names += [node.module, *(f'{node.module}.{alias.name}' for alias in node.names)]
    return names


def build_modules() -> set[str]:
    """build と同期が import する pipeline の Python（repo からの path）。"""
    pending = [PIPELINE / e for e in BUILD_ENTRIES] + [p for d in BUILD_PACKAGES for p in (PIPELINE / d).rglob('*.py')
                                                       if not p.name.endswith('_test.py')]
    seen: set[Path] = set()
    while pending:
        path = pending.pop()
        if path in seen:
            continue
        seen.add(path)
        for name in imported(path):
            parts = name.split('.')
            pending += [f for i in range(1, len(parts) + 1) if (f := module_file('.'.join(parts[:i]))) and f not in seen]
    return {str(p.relative_to(ROOT)) for p in seen}


def git(*args: str) -> str:
    return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout


def seed_codes(header: str, diff: list[str]) -> set[str] | None:
    """seed の差分（`git diff --unified=0` の行）の自治体コード。1列目が自治体コードでない seed は None（全件）。"""
    if header.split(',', 1)[0] != 'jurisdiction_code':
        return None
    codes = set()
    for line in diff:
        if line[:1] in '+-' and not line.startswith(('+++', '---')):
            code = line[1:].split(',', 1)[0]
            if not CODE.fullmatch(code):
                return None
            codes.add(code)
    return codes


def classify(paths: list[str], seed: Callable[[str], set[str] | None], build: set[str]) -> dict:
    """変わった path から範囲を決める。自治体に絞れると分かるもの以外の入力は全件に倒す。build は build_modules()。"""
    jurisdictions: set[str] = set()
    for path in paths:
        if not any(p.match(path) for p in INPUTS) or any(p.search(path) for p in IGNORED):
            continue
        if INGESTION.match(path) and path not in build:
            continue
        if not path.endswith('.py') and any(p.match(path) for p in CONVERTER_DATA):
            continue
        if match := next((m for p in JURISDICTION_PATHS if (m := p.match(path))), None):
            jurisdictions.add(match.group(1))
            continue
        codes = seed(path) if SEEDS.match(path) else None
        if codes is None:
            return {'mode': 'full', 'jurisdictions': [], 'reason': path}
        jurisdictions |= codes
    if not jurisdictions:
        return {'mode': 'none', 'jurisdictions': []}
    return {'mode': 'jurisdictions', 'jurisdictions': sorted(jurisdictions)}


def path_exists(ref: str, path: str) -> bool:
    return subprocess.run(['git', 'cat-file', '-e', f'{ref}:{path}'], cwd=ROOT, capture_output=True).returncode == 0


def scope(base: str, head: str) -> dict:
    def seed(path: str) -> set[str] | None:
        ref = head if path_exists(head, path) else base
        header = (git('show', f'{ref}:{path}').splitlines() or [''])[0]
        return seed_codes(header, git('diff', '--unified=0', base, head, '--', path).splitlines())
    return classify(git('diff', '--name-only', base, head).splitlines(), seed, build_modules())


RELATIONS = ('pipeline/dbt/macros/fiscal_csv_relations.sql', 'pipeline/dbt/macros/fiscal_pdf_relations.sql')


def run(*command: str) -> None:
    print('$', ' '.join(command), flush=True)
    subprocess.run(command, cwd=ROOT / 'pipeline', check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    target = parser.add_mutually_exclusive_group()
    target.add_argument('--database-id', help='D1 の database id')
    target.add_argument('--local', action='store_true', help='ローカルの D1（miniflare）に写す')
    which = parser.add_mutually_exclusive_group()
    which.add_argument('--since', help='この commit から HEAD までの差分で範囲を決める（既定: origin/main との分岐点）')
    which.add_argument('--all', action='store_true', help='全件を build して同期する')
    which.add_argument('--jurisdiction', action='append', metavar='CODE', help='その自治体を流す（複数指定可）')
    parser.add_argument('--dry-run', action='store_true',
                        help='D1 に書かない（build はする）。D1 を指定すれば D1 を読んで書く予定の行数を出し、指定しなければ D1 を読まない')
    parser.add_argument('--snapshot', help='前回の同期の写し（serving.sync_d1 の --snapshot）')
    parser.add_argument('--verify-all', action='store_true', help='写しがあっても D1 を全行読んで比べる')
    args = parser.parse_args()
    if not (args.database_id or args.local or args.dry_run):
        parser.error('--database-id か --local が要る（--dry-run なら省略できる）')

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
            *(['--local'] if args.local else ['--database-id', args.database_id] if args.database_id else []),
            *scoped, *(['--dry-run'] if args.dry_run else []),
            *(['--snapshot', args.snapshot] if args.snapshot else []), *(['--verify-all'] if args.verify_all else []))
    finally:
        if scoped and not dirty:
            git('checkout', '--', *RELATIONS)


if __name__ == '__main__':
    main()
