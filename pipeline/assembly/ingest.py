"""議会の会議録を発言単位に切って、D1 に差分で書く（手元で人が流す。CI・Actions では回さない）。

    bun run --cwd pipeline assembly:ingest -- --local --jurisdiction 131024             # ローカルの D1 に、まだ無い会議を足す
    bun run --cwd pipeline assembly:ingest -- --database-id <id> --jurisdiction 131024  # 本番の D1 に、まだ無い会議を足す
    bun run --cwd pipeline assembly:ingest -- --local --jurisdiction 131024 --dry-run   # 差分だけ出す（会議の一覧は取りに行くが、会議録の取得と書き込みはしない）
    bun run --cwd pipeline assembly:ingest -- --local --jurisdiction 131024 --from 6    # 令和6年から今年まで（既定）
    bun run --cwd pipeline assembly:ingest -- --local --jurisdiction 131024 --refetch r08_yosan20260319   # 入れ済みの会議を取り直し、変わっていれば入れ替える

- 入れる先の D1 にまだ無い会議だけを議会のサイトから取り、その分だけ書く。差分が無ければ一覧を見るだけで書き込みは0。
- 取った HTML は `pipeline/.cache/assembly/<自治体コード>/raw/` に置き、取り直すとき以外はサイトへ行かない。
- 表は D1 にだけ置き、dbt・marts・serving/sync_d1.py を通さない（議会の表は sync_d1.py の対象外なので、同期は触らない）。
  表はこの script が自分で作る（create table if not exists）。
- 推定でしか決まらない項目（問いと答えの対応・款・理事者の役職）は持たない。議員のフルネームは印字・名簿・出席者の欄で1人に決まるときだけ入れる（ADR 0054）。
- 同じ D1 に同時に2本流さない（差分は流し始めの D1 の中身から決めるので、並ぶと同じ会議を二重に書く）。
- 会議録のシステムは自治体ごとに違うので、読み方はシステムごとの module に置く（中央区は `chuo.py`、kensakusystem.jp は `kensaku.py`、VOICES は `voices.py`）。
- DiscussNet（ssp.kaigiroku.net）は robots.txt が /tenant/ 以外を禁じ、会議録を返す API（/dnp/search/）も禁止に入るので取らない（新宿・墨田・渋谷・北・荒川・練馬・立川・青梅・昭島・小平・東大和・清瀬・武蔵村山・瑞穂・小笠原、2026-11-25 確認）。
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path
from typing import Iterator

from assembly.chuo import Chuo
from assembly.common import Meeting, Member, Speech, State
from assembly.kensaku import KENSAKU
from assembly.voices import VOICES
from serving.sync_d1 import D1, LOCAL_DATABASE_ID, LOCAL_PERSIST_TO, literal, pack

PIPELINE = Path(__file__).resolve().parents[1]
CACHE = PIPELINE / '.cache/assembly'
BATCH_INTERVAL_SECONDS = 2.0

MEETING = 'assembly_meeting'
SPEECH = 'assembly_speech'
MEMBER = 'assembly_member'

SCHEMA = [
    f'''create table if not exists "{MEETING}" (
        "meeting_id" text primary key,          -- 131024:r08_yosan20260305
        "jurisdiction_code" text not null,
        "title" text not null,
        "kind" text not null,                   -- plenary・budget・settlement・committee・special・steering
        "body_name" text not null,              -- 本会議・予算特別委員会・企画総務委員会 など
        "held_on" text not null,
        "source_url" text not null,
        "agenda" text not null,
        "content_hash" text not null            -- 取った HTML の sha256 の先頭16桁。取り直したとき変わったかを見る
    )''',
    f'create index if not exists "{MEETING}_jurisdiction_held_on" on "{MEETING}" ("jurisdiction_code", "held_on")',
    f'''create table if not exists "{SPEECH}" (
        "meeting_id" text not null,
        "seq" integer not null,                 -- 会議の中での発言の順番（1から）
        "speaker_label" text not null,          -- 会議録の「○」の後ろの印字のまま
        "speaker_kind" text not null,           -- member・chair・official・other
        "member_name" text,                     -- 印字・名簿・出席者の欄で1人に決まったときだけ。決まらなければ NULL
        "body" text not null,
        primary key ("meeting_id", "seq")
    )''',
    f'create index if not exists "{SPEECH}_member" on "{SPEECH}" ("member_name")',
    f'''create table if not exists "{MEMBER}" (
        "jurisdiction_code" text not null,
        "name" text not null,                   -- ほづみゆうき
        "surname" text not null,
        "given" text not null,
        primary key ("jurisdiction_code", "name")
    )''',
]


SOURCES = {s.code: s for s in [Chuo(), *KENSAKU, *VOICES]}


# ---- D1 ----

def read_state(d1: D1, code: str, create: bool) -> State:
    """create が偽（--dry-run）のときは表を作らず、まだ表が無ければ空の状態として扱う。"""
    if create:
        d1.batch([{'sql': sql} for sql in SCHEMA])
    else:
        tables = d1.batch([{'sql': "select \"name\" from sqlite_master where \"type\" = 'table'"}])
        names = {r[0] for r in tables[0]['results']['rows']}
        if not {MEETING, MEMBER} <= names:
            return State()
    results = d1.batch([
        {'sql': f'select "meeting_id", "content_hash" from "{MEETING}" where "jurisdiction_code" = {literal(code)}'},
        {'sql': f'select "name", "surname", "given" from "{MEMBER}" where "jurisdiction_code" = {literal(code)}'},
    ])
    state = State()
    prefix = f'{code}:'
    for meeting_id, content_hash in results[-2]['results']['rows']:
        state.meetings[meeting_id.removeprefix(prefix)] = content_hash
    for name, surname, given in results[-1]['results']['rows']:
        state.members[name] = Member(surname, given)
    return state


def row(table: str, values: dict, verb: str = 'insert') -> str:
    cols = ', '.join(f'"{k}"' for k in values)
    return f'{verb} into "{table}" ({cols}) values ({", ".join(literal(v) for v in values.values())})'


def meeting_statements(meeting: Meeting, speeches: list[Speech], replace: bool) -> Iterator[str]:
    """会議の行は発言の後に書く。batch をまたいで途中で止まっても、会議の行が無ければ次の回にその会議を取り直し、
    先頭の delete が書きかけの発言を消す（消す行が無ければ書き込みにならない）。"""
    if replace:
        yield f'delete from "{MEETING}" where "meeting_id" = {literal(meeting.meeting_id)}'
    yield f'delete from "{SPEECH}" where "meeting_id" = {literal(meeting.meeting_id)}'
    for s in speeches:
        yield row(SPEECH, s.__dict__)
    yield row(MEETING, meeting.__dict__)


# ---- main ----

def fetch(source, local_id: str, force: bool) -> str:
    file = CACHE / source.code / 'raw' / f'{local_id}.html'
    if not force and file.exists():
        return file.read_text(encoding='utf-8')
    page = source.download(local_id)
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(page, encoding='utf-8')
    return page


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument('--database-id', help='D1 の database id（本番）')
    target.add_argument('--local', action='store_true', help='ローカルの D1（miniflare）に書く')
    parser.add_argument('--persist-to', type=Path, default=LOCAL_PERSIST_TO, help='--local の状態の置き場')
    parser.add_argument('--jurisdiction', required=True, choices=sorted(SOURCES), help='自治体コード（131024 中央区など）')
    parser.add_argument('--from', dest='from_reiwa', type=int, default=6, help='令和の何年から見るか')
    parser.add_argument('--refetch', action='append', default=[], help='入れ済みの会議を取り直す（例 r08_yosan20260305）')
    parser.add_argument('--dry-run', action='store_true', help='会議の一覧だけ取り、会議録の取得と書き込みはせず、差分だけ出す')
    args = parser.parse_args()

    source = SOURCES[args.jurisdiction]
    d1 = D1(LOCAL_DATABASE_ID if args.local else args.database_id, args.local, args.persist_to)
    target_name = 'ローカルの D1' if args.local else '本番の D1'

    state = read_state(d1, source.code, create=not args.dry_run)
    listed = source.list_ids(args.from_reiwa)
    for local_id in args.refetch:
        if local_id not in state.meetings:
            parser.error(f'--refetch {local_id} は {target_name} にまだ入っていない。'
                         '新しい会議は --refetch を外して流す（--from がその会議の年を含むこと）')
    added = [i for i in listed if i not in state.meetings]
    refetch = list(args.refetch)
    print(f'{target_name}: 入れ済み {len(state.meetings)} 会議。サイトの一覧 {len(listed)} 会議のうち、'
          f'新しい会議 {len(added)}、取り直し {len(refetch)}', flush=True)
    if args.dry_run:
        for i in added:
            print(f'  + {i}')
        for i in refetch:
            print(f'  ~ {i}')
        return 0
    if not added and not refetch:
        print('差分なし。何も書かない')
        return 0

    pages = [(i, fetch(source, i, False), False) for i in added] + [(i, fetch(source, i, True), True) for i in refetch]

    # 名簿は D1 に入れ済みの議員に、今回取った本会議の出席議員を足したもの
    members = dict(state.members)
    new_members: dict[str, Member] = {}
    for _, page, _ in pages:
        for name, member in source.roster(page).items():
            if name not in members:
                members[name] = new_members[name] = member

    statements: list[str] = [row(MEMBER, {'jurisdiction_code': source.code, 'name': n, 'surname': m.surname, 'given': m.given}, 'insert or ignore')
                             for n, m in new_members.items()]
    written = speech_count = unresolved = unchanged = 0
    for local_id, page, replace in pages:
        meeting, speeches = source.parse(local_id, page, members)
        if replace and state.meetings.get(local_id) == meeting.content_hash:
            unchanged += 1
            continue
        statements += meeting_statements(meeting, speeches, replace)
        written += 1
        speech_count += len(speeches)
        unresolved += sum(1 for s in speeches if s.speaker_kind == 'member' and not s.member_name)
    if not statements:
        print(f'取り直した {unchanged} 会議はどれも変わっていない。何も書かない')
        return 0

    for batch in pack(iter(statements)):
        d1.batch(batch)
        # 続けて書くと D1 が overloaded（429）を返し、同じ D1 を読む API まで止まる。batch の間を空ける
        time.sleep(BATCH_INTERVAL_SECONDS)
    print(f'{target_name} に書いた: 会議 {written}、発言 {speech_count}、議員 {len(new_members)}'
          f'（変わらず飛ばした取り直し {unchanged}、議員の発言で名前が決まらなかったもの {unresolved}）/ cf {d1.calls} 回')
    return 0


if __name__ == '__main__':
    sys.exit(main())
