"""中央区議会（https://www.kugikai.city.chuo.lg.jp）の会議録。独自のシステムで、robots.txt に会議録の制限は無い（2026-11-24 確認）。"""
from __future__ import annotations

import re
from datetime import date

from assembly.common import Meeting, Member, Speech, http, sha, strip_tags


def to_lines(page: str) -> list[str]:
    parts = page.split('ここから本文です')
    t = parts[1] if len(parts) > 1 else page
    # 本文の後ろは問い合わせ先の枠（<p class="add">）と script。発言に「お問い合わせ先」と出ても切らないよう、文字ではなく枠で切る
    t = re.split(r'<p class="add">|<script\b', t, maxsplit=1, flags=re.I)[0]
    return strip_tags(t)


def local_id(path: str) -> str:
    return path.replace('/', '_', 1)


def path_of(local_id: str) -> str:
    return local_id.replace('_', '/', 1)


class Chuo:
    code = '131024'
    base = 'https://www.kugikai.city.chuo.lg.jp'

    def list_ids(self, from_reiwa: int) -> list[str]:
        """会議録検索の「年」の値は令和の年 + 30（38 = 令和8）。令和 from_reiwa 年から今年までを見る。"""
        paths: set[str] = set()
        for reiwa in range(from_reiwa, date.today().year - 2018 + 1):
            page = http(f'{self.base}/kaigiroku/index.cgi',
                        {'term': 'date', 'sel_year': str(reiwa + 30), 'sort_day': 'desc', 'searchlist': '検索'})
            for m in re.finditer(r'kaigiroku\.cgi/(r\d+/[A-Za-z0-9_-]+)\.html', page):
                if not re.search(r'mokuji|rijisya', m.group(1)):
                    paths.add(m.group(1))
        return sorted(local_id(p) for p in paths)

    def url(self, local_id: str) -> str:
        return f'{self.base}/kaigiroku.cgi/{path_of(local_id)}.html'

    def download(self, local_id: str) -> str:
        return http(self.url(local_id))

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

    def roster(self, page: str) -> dict[str, Member]:
        """本会議の出席議員「一番　ほづみ　ゆうき議員」から議員の名簿を作る。"""
        found: dict[str, Member] = {}
        for line in to_lines(page):
            m = re.match(r'^[一二三四五六七八九十]+番[\s　]+(\S+)[\s　]+(\S+?)議員$', line)
            if m:
                found[m.group(1) + m.group(2)] = Member(m.group(1), m.group(2))
        return found

    def parse(self, local_id: str, page: str, members: dict[str, Member]) -> tuple[Meeting, list[Speech]]:
        path = path_of(local_id)
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
        meeting_id = f'{self.code}:{local_id}'
        meeting = Meeting(meeting_id, self.code, title, kind, body_name, self.held_on(title, path), self.url(local_id), agenda, sha(page))

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
