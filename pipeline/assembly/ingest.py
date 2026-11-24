"""議会の会議録を発言単位に切って、D1 に差分で書く（手元で人が流す。CI・Actions では回さない）。

    bun run --cwd pipeline assembly:ingest -- --local                         # ローカルの D1 に、まだ無い会議を足す
    bun run --cwd pipeline assembly:ingest -- --database-id <id>              # 本番の D1 に、まだ無い会議を足す
    bun run --cwd pipeline assembly:ingest -- --local --dry-run               # 何を取り何を書くかだけ出す（取得も書き込みもしない）
    bun run --cwd pipeline assembly:ingest -- --local --from 6                # 令和6年から今年まで（既定）
    bun run --cwd pipeline assembly:ingest -- --local --refetch r08_yosan20260305   # 入れ済みの会議を取り直し、変わっていれば入れ替える

- 入れる先の D1 にまだ無い会議だけを議会のサイトから取り、その分だけ書く。差分が無ければ一覧を見るだけで書き込みは0。
- 取った HTML は `pipeline/.cache/assembly/<自治体コード>/raw/` に置き、取り直すとき以外はサイトへ行かない。
- 表は D1 にだけ置き、dbt・marts・serving/sync_d1.py を通さない（議会の表は sync_d1.py の対象外なので、同期は触らない）。
  表はこの script が自分で作る（create table if not exists）。
- 推定でしか決まらない項目（問いと答えの対応・款・理事者の役職）は持たない。議員のフルネームは名簿で1人に決まるときだけ入れる。
- 今は中央区（131024）だけ。会議録のシステムは自治体ごとに違うので、自治体を足すときは SOURCES に読み方を足す。
"""
from __future__ import annotations

import argparse
import hashlib
import html as html_lib
import re
import sys
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Iterator

from serving.sync_d1 import D1, LOCAL_DATABASE_ID, LOCAL_PERSIST_TO, literal, pack

PIPELINE = Path(__file__).resolve().parents[1]
CACHE = PIPELINE / '.cache/assembly'
FETCH_INTERVAL_SECONDS = 1.0
USER_AGENT = 'fudoki-assembly-ingest'

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
        "member_name" text,                     -- 議員の名簿で1人に決まったときだけ。決まらなければ NULL
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


@dataclass
class Member:
    surname: str
    given: str


@dataclass
class Meeting:
    meeting_id: str
    jurisdiction_code: str
    title: str
    kind: str
    body_name: str
    held_on: str
    source_url: str
    agenda: str
    content_hash: str


@dataclass
class Speech:
    meeting_id: str
    seq: int
    speaker_label: str
    speaker_kind: str
    member_name: str | None
    body: str


@dataclass
class State:
    meetings: dict[str, str] = field(default_factory=dict)  # local id -> content_hash
    members: dict[str, Member] = field(default_factory=dict)


def sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def http(url: str, data: dict | None = None) -> str:
    body = urllib.parse.urlencode(data).encode() if data else None
    request = urllib.request.Request(url, data=body, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode('utf-8')


# ---- 会議録を行に直す（中央区の HTML） ----

def to_lines(page: str) -> list[str]:
    parts = page.split('ここから本文です')
    t = parts[1] if len(parts) > 1 else page
    t = t.split('お問い合わせ先')[0].split('<script')[0]
    t = re.sub(r'<br\s*/?>', '\n', t, flags=re.I)
    t = re.sub(r'</(p|div|li|h\d|tr)>', '\n', t, flags=re.I)
    # 入れ子の崩れた印も残さないよう、タグが無くなるまで外す。ここで作るのは表示用の HTML ではなく本文の文字
    prev = None
    while prev != t:
        prev, t = t, re.sub(r'<[^>]*>', '', t)
    t = html_lib.unescape(t).replace('\xa0', ' ')
    return [line.strip() for line in t.split('\n') if line.strip()]


# ---- 中央区 ----

class Chuo:
    """中央区議会（https://www.kugikai.city.chuo.lg.jp）の会議録。独自のシステムで、robots.txt に会議録の制限は無い（2026-11-24 確認）。"""
    code = '131024'
    base = 'https://www.kugikai.city.chuo.lg.jp'

    def list_paths(self, from_reiwa: int) -> list[str]:
        """会議録検索の「年」の値は令和の年 + 30（38 = 令和8）。令和 from_reiwa 年から今年までを見る。"""
        paths: set[str] = set()
        for reiwa in range(from_reiwa, date.today().year - 2018 + 1):
            page = http(f'{self.base}/kaigiroku/index.cgi',
                        {'term': 'date', 'sel_year': str(reiwa + 30), 'sort_day': 'desc', 'searchlist': '検索'})
            for m in re.finditer(r'kaigiroku\.cgi/(r\d+/[A-Za-z0-9_-]+)\.html', page):
                if not re.search(r'mokuji|rijisya', m.group(1)):
                    paths.add(m.group(1))
            time.sleep(FETCH_INTERVAL_SECONDS)
        return sorted(paths)

    def local_id(self, path: str) -> str:
        return path.replace('/', '_', 1)

    def path_of(self, local_id: str) -> str:
        return local_id.replace('_', '/', 1)

    def url(self, path: str) -> str:
        return f'{self.base}/kaigiroku.cgi/{path}.html'

    def held_on(self, title: str, path: str) -> str:
        m = re.search(r'(20\d{2})(\d{2})(\d{2})', path)
        if m:
            return f'{m.group(1)}-{m.group(2)}-{m.group(3)}'
        z = title.translate(str.maketrans('０１２３４５６７８９', '0123456789'))
        y = re.search(r'令和(\d+)年', z)
        md = re.search(r'(\d+)月\s*(\d+)日', z)
        if not y or not md:
            raise ValueError(f'日付が読めない: {title}')
        return f'{2018 + int(y.group(1))}-{int(md.group(1)):02d}-{int(md.group(2)):02d}'

    def kind_of(self, path: str, title: str) -> tuple[str, str]:
        name = re.sub(r'[\d-]+$', '', path.split('/')[1])
        if name in ('teireikai', 'rinjikai'):
            return 'plenary', '本会議'
        if name == 'yosan':
            return 'budget', '予算特別委員会'
        if name == 'kessan':
            return 'settlement', '決算特別委員会'
        if name == 'gikaiunei':
            return 'steering', '議会運営委員会'
        m = re.search(r'[\s　]([^\s　(（]+委員会)', title)
        body_name = m.group(1) if m else name
        return ('special' if '特別委員会' in body_name else 'committee'), body_name

    def roster(self, lines: list[str]) -> dict[str, Member]:
        """本会議の出席議員「一番　ほづみ　ゆうき議員」から議員の名簿を作る。"""
        found: dict[str, Member] = {}
        for line in lines:
            m = re.match(r'^[一二三四五六七八九十]+番[\s　]+(\S+)[\s　]+(\S+?)議員$', line)
            if m:
                found[m.group(1) + m.group(2)] = Member(m.group(1), m.group(2))
        return found

    def parse(self, path: str, page: str, members: dict[str, Member]) -> tuple[Meeting, list[Speech]]:
        lines = to_lines(page)
        title = re.sub(r'[\s　]+', ' ', lines[0])
        kind, body_name = self.kind_of(path, title)
        first = next((i for i, line in enumerate(lines) if line.startswith('○')), -1)
        head = lines if first == -1 else lines[:first]
        agenda_start = next((i for i, line in enumerate(head) if re.match(r'^[0-9０-９]+．(議題|議事日程)', line)), -1)
        agenda = '' if agenda_start == -1 else '\n'.join(l for l in head[agenda_start + 1:] if not re.match(r'^（.*）$', l))
        # 委員会の出席者「委員　ほづみ　ゆうき」
        attendees = [m.group(1) + m.group(2) for line in head
                     if (m := re.match(r'^(?:委員長|副委員長|委員|議長|副議長)[\s　]+(\S+)[\s　]+(\S+)$', line))]
        meeting_id = f'{self.code}:{self.local_id(path)}'
        meeting = Meeting(meeting_id, self.code, title, kind, body_name, self.held_on(title, path), self.url(path), agenda, sha(page))

        speeches: list[Speech] = []
        if first != -1:
            label: str | None = None
            body: list[str] = []

            def flush() -> None:
                if label is None:
                    return
                text = '\n'.join(l for l in body if not re.match(r'^（.+）$', l))
                speaker_kind, member_name = classify(label, members, attendees)
                speeches.append(Speech(meeting_id, len(speeches) + 1, label, speaker_kind, member_name, text))

            for line in lines[first:]:
                if line.startswith('○'):
                    flush()
                    rest = line[1:].replace('(', '（').replace(')', '）')
                    # 「十四番（太田　太議員）」のように括弧の中に空白があるときは、閉じ括弧までを名前にする
                    m = re.match(r'^([^\s　（]*（[^）]*）\S*?|\S+?)(?:[\s　]+(.*))?$', rest)
                    label = re.sub(r'[\s　]', '', m.group(1) if m else rest)
                    body = [m.group(2)] if m and m.group(2) else []
                elif label is not None:
                    body.append(line)
            flush()
        return meeting, speeches


def resolve_member(members: dict[str, Member], base: str, hint: str | None, attendees: list[str]) -> str | None:
    """姓（と委員会の「高橋（ま）」の名の頭）で名簿から1人に決まるときだけ名前を返す。"""
    cands = [k for k, v in members.items() if v.surname == base and (not hint or v.given.startswith(hint))]
    if len(cands) == 1:
        return cands[0]
    in_room = [k for k in cands if k in attendees]
    return in_room[0] if len(in_room) == 1 else None


def classify(label: str, members: dict[str, Member], attendees: list[str]) -> tuple[str, str | None]:
    # 本会議: 一番（ほづみゆうき議員）・議長（瓜生正高議員）
    if m := re.match(r'^(.+?)（(.+?)議員）$', label):
        return ('chair' if m.group(1).endswith('議長') else 'member'), (m.group(2) if m.group(2) in members else None)
    # 本会議の理事者: 区長（山本泰人君）
    if re.match(r'^(.+?)（.+?(君|さん)）$', label):
        return 'official', None
    # 委員会: ほづみ委員・高橋（ま）委員・田中（広）委員長
    m = re.match(r'^([^（]{1,5}?)(?:（(.)）)?(前|副)?委員(長)?(?:（.*）)?$', label)
    if m and not re.search(r'教育|選挙|監査', m.group(1)):
        is_chair = bool(m.group(4)) and not m.group(3)
        return ('chair' if is_chair else 'member'), resolve_member(members, m.group(1), m.group(2), attendees)
    # 本会議の「奥村議員」（番号の無い呼び方）
    if m := re.match(r'^([^（]{1,5})議員$', label):
        return 'member', resolve_member(members, m.group(1), None, attendees)
    if re.search(r'(議長|副議長)$', label):
        return 'chair', None
    # 委員会の理事者: 平川地域振興課長・植木地域福祉課長（参事）
    return ('official' if re.search(r'長|参事|所長|管理者|教育長|区長', label) else 'other'), None


SOURCES = {Chuo.code: Chuo()}


# ---- D1 ----

def read_state(d1: D1, code: str) -> State:
    results = d1.batch([{'sql': sql} for sql in SCHEMA] + [
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

def fetch(source: Chuo, path: str, force: bool) -> str:
    file = CACHE / source.code / 'raw' / f'{source.local_id(path)}.html'
    if not force and file.exists():
        return file.read_text(encoding='utf-8')
    page = http(source.url(path))
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(page, encoding='utf-8')
    time.sleep(FETCH_INTERVAL_SECONDS)
    return page


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument('--database-id', help='D1 の database id（本番）')
    target.add_argument('--local', action='store_true', help='ローカルの D1（miniflare）に書く')
    parser.add_argument('--persist-to', type=Path, default=LOCAL_PERSIST_TO, help='--local の状態の置き場')
    parser.add_argument('--jurisdiction', default=Chuo.code, choices=sorted(SOURCES), help='自治体コード')
    parser.add_argument('--from', dest='from_reiwa', type=int, default=6, help='令和の何年から見るか')
    parser.add_argument('--refetch', action='append', default=[], help='入れ済みの会議を取り直す（例 r08_yosan20260305）')
    parser.add_argument('--dry-run', action='store_true', help='取得も書き込みもせず、差分だけ出す')
    args = parser.parse_args()

    source = SOURCES[args.jurisdiction]
    d1 = D1(LOCAL_DATABASE_ID if args.local else args.database_id, args.local, args.persist_to)
    target_name = 'ローカルの D1' if args.local else '本番の D1'

    state = read_state(d1, source.code)
    listed = source.list_paths(args.from_reiwa)
    for local_id in args.refetch:
        if local_id not in state.meetings:
            parser.error(f'--refetch {local_id} は {target_name} にまだ無い')
    added = [p for p in listed if source.local_id(p) not in state.meetings]
    refetch = [source.path_of(i) for i in args.refetch]
    print(f'{target_name}: 入れ済み {len(state.meetings)} 会議。サイトの一覧 {len(listed)} 会議のうち、'
          f'新しい会議 {len(added)}、取り直し {len(refetch)}', flush=True)
    if args.dry_run:
        for p in added:
            print(f'  + {source.local_id(p)}')
        for p in refetch:
            print(f'  ~ {source.local_id(p)}')
        return 0
    if not added and not refetch:
        print('差分なし。何も書かない')
        return 0

    pages = [(p, fetch(source, p, False), False) for p in added] + [(p, fetch(source, p, True), True) for p in refetch]

    # 名簿は D1 に入れ済みの議員に、今回取った本会議の出席議員を足したもの
    members = dict(state.members)
    new_members: dict[str, Member] = {}
    for _, page, _ in pages:
        for name, member in source.roster(to_lines(page)).items():
            if name not in members:
                members[name] = new_members[name] = member

    statements: list[str] = [row(MEMBER, {'jurisdiction_code': source.code, 'name': n, 'surname': m.surname, 'given': m.given}, 'insert or ignore')
                             for n, m in new_members.items()]
    written = speech_count = unresolved = unchanged = 0
    for path, page, replace in pages:
        meeting, speeches = source.parse(path, page, members)
        if replace and state.meetings.get(source.local_id(path)) == meeting.content_hash:
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
    print(f'{target_name} に書いた: 会議 {written}、発言 {speech_count}、議員 {len(new_members)}'
          f'（変わらず飛ばした取り直し {unchanged}、議員の発言で名前が決まらなかったもの {unresolved}）/ cf {d1.calls} 回')
    return 0


if __name__ == '__main__':
    sys.exit(main())
