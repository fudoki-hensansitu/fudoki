"""事業の資料の取り込み結果を、別の commit の読み方の結果と全件で突き合わせる（docs/prd/page-words/dd.md の手順 6〜8）。

評価シート・指標・指標の値・施策の全行を、公開の ID の元になる列（`origin_id`・`page`・`position`）ごと比べる。
基準は `--base` の commit のコードで読んだ結果で、その commit を `.cache/worktrees/` に取り出して読む。
出典の PDF と読んだ結果のキャッシュ（`.cache/objects`・`.cache/project`）は今の作業ツリーと共有する。

    bun run --cwd pipeline project:baseline -- --base origin/main            # 差が無ければ 0 で終わる
    bun run --cwd pipeline project:baseline -- --base origin/main --jurisdiction 131091
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

from ingestion.paths import CACHE, REPO

# 表ごとの行を区別する列（表の先頭からの列の数）。公開の ID はこの列から作る
KEYS = {
    'project_origin': 1,
    'project_evaluation_sheet': 2,
    'project_evaluation_indicator': 3,
    'project_evaluation_indicator_value': 4,
    'project_budget_measure': 3,
}


def dump(out: Path, jurisdictions: set[str] | None, remote: bool) -> None:
    """この作業ツリーのコードで読んだ表を、表ごとに1行1 JSON の配列で書く（行は並べ替える）。"""
    from ingestion.project import run

    tables = run.load(remote=remote, jurisdictions=jurisdictions, page_texts=False)
    out.mkdir(parents=True, exist_ok=True)
    for name in KEYS:
        rows = sorted(json.dumps(list(row), ensure_ascii=False) for row in tables[name])
        (out / f'{name}.jsonl').write_text(''.join(f'{r}\n' for r in rows), encoding='utf-8')


def worktree(ref: str) -> Path:
    """ref の commit を取り出した作業ツリー。キャッシュの置き場は今の作業ツリーのものに繋ぐ。"""
    sha = subprocess.run(['git', 'rev-parse', ref], cwd=REPO, check=True, capture_output=True, text=True).stdout.strip()
    path = CACHE / 'worktrees' / sha
    if not path.exists():
        subprocess.run(['git', 'worktree', 'add', '--detach', str(path), sha], cwd=REPO, check=True, capture_output=True)
        (path / 'pipeline' / '.cache').symlink_to(CACHE)
    return path


def read(directory: Path, name: str) -> list[list]:
    return [json.loads(line) for line in (directory / f'{name}.jsonl').read_text(encoding='utf-8').splitlines()]


def compare(base: Path, head: Path, samples: int) -> int:
    """表ごとに、基準にだけある行・今にだけある行を数え、自治体ごとの数と例を出す。差の行の数の合計を返す。"""
    origins = {row[0]: row[1] for directory in (base, head) for row in read(directory, 'project_origin')}
    total = 0
    for name, width in KEYS.items():
        before = Counter(json.dumps(r, ensure_ascii=False) for r in read(base, name))
        after = Counter(json.dumps(r, ensure_ascii=False) for r in read(head, name))
        removed, added = before - after, after - before
        count = sum(removed.values()) + sum(added.values())
        total += count
        print(f'{name}: 基準 {sum(before.values())} 行・今 {sum(after.values())} 行・差 {count} 行')
        if not count:
            continue
        by_place = Counter(origins.get(json.loads(r)[0], '?') for r in (*removed.elements(), *added.elements()))
        print('  自治体ごと: ' + '、'.join(f'{code} {n}' for code, n in by_place.most_common()))
        keyed_before = {tuple(json.loads(r)[:width]): r for r in removed}
        keyed_after = {tuple(json.loads(r)[:width]): r for r in added}
        for key in sorted(keyed_before.keys() | keyed_after.keys(), key=str)[:samples]:
            print(f'  {key}')
            print(f'    基準: {keyed_before.get(key, "（無い）")}')
            print(f'    今　: {keyed_after.get(key, "（無い）")}')
    return total


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--base', help='基準にする commit（branch・tag でもよい）')
    parser.add_argument('--jurisdiction', action='append', help='この自治体の資料だけを読む（複数可）')
    parser.add_argument('--remote', action='store_true', help='キャッシュに無い PDF を R2 から取る')
    parser.add_argument('--samples', type=int, default=5, help='表ごとに出す差の例の数')
    parser.add_argument('--dump', type=Path, help=argparse.SUPPRESS)  # 基準の作業ツリーの中で呼ぶ入口
    args = parser.parse_args()
    jurisdictions = set(args.jurisdiction) if args.jurisdiction else None
    if args.dump:
        dump(args.dump, jurisdictions, args.remote)
        return
    if not args.base:
        parser.error('--base が要る')
    out = CACHE / 'project-baseline'
    dump(out / 'head', jurisdictions, args.remote)
    tree = worktree(args.base)
    flags = [f for code in args.jurisdiction or [] for f in ('--jurisdiction', code)] + (['--remote'] if args.remote else [])
    subprocess.run(['uv', 'run', 'python', '-m', 'ingestion.project.baseline', '--dump', str(out / 'base'), *flags],
                   cwd=tree / 'pipeline', check=True)
    sys.exit(1 if compare(out / 'base', out / 'head', args.samples) else 0)


if __name__ == '__main__':
    main()
