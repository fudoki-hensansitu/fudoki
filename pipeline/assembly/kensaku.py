"""kensakusystem.jp（会議録検索システム）の会議録。robots.txt は置かれていない（404、2026-11-24 確認）。

閲覧の木（See.exe）を年→会議体の順に POST で開いて会議録のファイル名を集め、
1つの会議録は発言者の一覧（r_Speakers.exe）の全部の位置を GetPerson.exe に POST して1枚で受け取る。
発言者の印字は「○鈴木まさし議長」のようにフルネームと役職が続き、名前は冒頭の出席者の欄で確かめる。
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from assembly.common import Meeting, Member, Speech, current_reiwa, http, kind_of_body, reiwa_date, sha, strip_tags

ENCODING = 'cp932'
ROLE = r'(副?議長|副?委員長|委員|議員)'
# ○ で始まっても発言ではない冒頭の見出し
HEADINGS = re.compile(r'^(議事日程|本日の会議に付した事件|会議に付した事件|出席(議員|委員|説明員|者)|欠席(議員|委員)|'
                      r'説明のため出席した者|職務のため出席した.*|議会事務局.*|署名議員|議題|付議事件|案件)$')


def reiwa_label(n: int) -> str:
    """木の年の印字。「令和元年」「令和 8年」（1桁は前に半角の空白）。"""
    return '令和元年' if n == 1 else f'令和{n:2d}年'


@dataclass
class Kensaku:
    code: str
    tenant: str  # https://www.kensakusystem.jp/<tenant>/
    _token: str | None = None

    @property
    def base(self) -> str:
        return f'https://www.kensakusystem.jp/{self.tenant}'

    def token(self) -> str:
        """各 CGI に渡す Code。入口の頁の「会議録の閲覧」の link にある。"""
        if self._token is None:
            m = re.search(r'See\.exe\?Code=([a-z0-9]+)', http(f'{self.base}/', encoding=ENCODING))
            if not m:
                raise RuntimeError(f'{self.base}/ に See.exe の Code が無い')
            self._token = m.group(1)
        return self._token

    def see(self, treedepth: str) -> str:
        return http(f'{self.base}/cgi-bin3/See.exe', {'Code': self.token(), 'treedepth': treedepth}, ENCODING)

    def list_ids(self, from_reiwa: int) -> list[str]:
        ids: dict[str, None] = {}
        for n in range(from_reiwa, current_reiwa() + 1):
            year = reiwa_label(n)
            nodes = sorted(set(re.findall(rf"treedepth\.value='({re.escape(year)} [^']+ )'", self.see(year))))
            for node in nodes:
                for file_name in re.findall(r'ResultFrame\.exe\?Code=\w+&fileName=(\w+)&startPos=0', self.see(node)):
                    ids[file_name] = None
        return sorted(ids)

    def url(self, local_id: str) -> str:
        return f'{self.base}/cgi-bin3/ResultFrame.exe?Code={self.token()}&fileName={local_id}&startPos=0'

    def download(self, local_id: str) -> str:
        frame = http(self.url(local_id), encoding=ENCODING)
        m = re.search(r'SRC="(/[^"]*/r_Speakers\.exe\?[^"]+)"', frame, flags=re.I)
        if not m:
            raise RuntimeError(f'{local_id}: 発言者の一覧の frame が無い')
        speakers = http(f'https://www.kensakusystem.jp{m.group(1)}', encoding=ENCODING)
        positions = re.findall(r'name="downloadPos" value="(\d+)"', speakers)
        if not positions:
            raise RuntimeError(f'{local_id}: 発言の位置が無い')
        return http(f'{self.base}/cgi-bin3/GetPerson.exe',
                    {'Code': self.token(), 'fileName': local_id, 'downloadPos': positions}, ENCODING)

    def roster(self, page: str) -> dict[str, Member]:
        """発言者の印字がフルネームなので、名簿を作らずに出席者の欄で確かめる。"""
        return {}

    def parse(self, local_id: str, page: str, members: dict[str, Member]) -> tuple[Meeting, list[Speech]]:
        lines = strip_tags(page)
        held = next(l for l in lines if l.startswith('開催日：'))
        title = re.sub(r'\s+', ' ', next(l for l in lines if l.startswith('会議名：')).removeprefix('会議名：')).strip()
        # 「令和 8年予算特別委員会（第1日 2月24日）」「令和 6年第1回定例会（第1日 2月20日）」
        body_name = re.sub(r'^令和\s*(\d+|元)年\s*', '', re.sub(r'（[^）]*）$', '', title)).strip()
        if re.match(r'^第\s*\d+\s*回\s*(定例会|臨時会)', body_name):
            body_name = '本会議'
        meeting_id = f'{self.code}:{local_id}'
        meeting = Meeting(meeting_id, self.code, title, kind_of_body(body_name), body_name,
                          reiwa_date(held), self.url(local_id), '', sha(page))

        first = next((i for i, l in enumerate(lines) if l.startswith('○') and not HEADINGS.match(split_label(l)[0])), -1)
        # 出席者の欄の名前は字の間を空けて揃えてある（「岩　崎　ふみひろ」）。空白を詰めて名前を探す
        attendance = re.sub(r'\s', '', ''.join(lines if first == -1 else lines[:first]))
        speeches: list[Speech] = []
        if first == -1:
            return meeting, speeches
        label: str | None = None
        body: list[str] = []

        def flush() -> None:
            if label is None:
                return
            speaker_kind, member_name = classify(label, attendance)
            text = '\n'.join(l for l in body if not re.match(r'^([（〔].*[）〕]|〇.*)$', l))
            speeches.append(Speech(meeting_id, len(speeches) + 1, label, speaker_kind, member_name, text))

        for line in lines[first:]:
            if line.startswith('○'):
                head, rest = split_label(line)
                if HEADINGS.match(head):
                    flush()
                    label, body = None, []
                    continue
                flush()
                label, body = head, ([rest] if rest else [])
            elif label is not None:
                body.append(line)
        flush()
        return meeting, speeches


def split_label(line: str) -> tuple[str, str]:
    """「○鈴木まさし議長　　ただいまから」を印字と本文に分ける。印字の後ろは全角の空白。
    「○岸　大介委員」のように名前の中にも空白があるので、役職や括弧で終わるところまでを印字にし、印字の中の空白は詰める。"""
    m = re.match(r'^○(.+?(?:議長|委員長|委員|議員|長|）|君|さん|監|理事|官|者|幹))(?:[\s　]+(.*))?$', line)
    if not m:
        m = re.match(r'^○([^\s　]+)[\s　]*(.*)$', line)
    return (re.sub(r'[\s　]', '', m.group(1)), m.group(2) or '') if m else (line[1:], '')


def classify(label: str, attendance: str) -> tuple[str, str | None]:
    """印字の役職で話し手の区分を決め、議員の名前は出席者の欄にそのまま載っているときだけ入れる。"""
    def known(name: str) -> str | None:
        return name if len(name) >= 2 and name in attendance else None

    # 本会議: ２４番（吉野正人議員）・議長（鈴木まさし議員）
    if m := re.match(r'^(.+?)（(.+?)議員）$', label):
        return ('chair' if m.group(1).endswith('議長') else 'member'), known(m.group(2))
    # 委員会: 岩崎ふみひろ委員長・佐藤ゆたか年長委員・鈴木まさし前議長・そのべせいや委員外議員
    m = re.match(rf'^(.+?)(年長|前|臨時|委員外)?{ROLE}$', label)
    if m and not re.search(r'監査|教育|選挙|農業', m.group(1)):
        # 「宍戸三郎議会広報小委員会委員長」は別の会議体の長で、この会議の進行ではない。名前は出席者の欄に載る一番長い頭の部分
        head = m.group(1)
        other_body = '委員会' in head
        kind = 'chair' if m.group(3) in ('議長', '副議長', '委員長') and not m.group(2) and not other_body else 'member'
        if other_body:
            return kind, next((head[:n] for n in range(len(head), 1, -1) if head[:n] in attendance), None)
        return kind, known(head)
    return ('official' if re.search(r'長|参事|管理者|監|理事|課|官|主幹|委員', label) else 'other'), None


KENSAKU = [Kensaku('131105', 'meguro'), Kensaku('131164', 'toshima'), Kensaku('131229', 'katsushika')]
