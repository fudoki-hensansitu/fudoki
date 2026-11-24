"""VOICES（会議録検索システム VOICES/Web）の会議録。

閲覧の CGI（voiweb.exe）に、年と会議の区分（KGTP: 1 定例会・2 臨時会・3 委員会）を渡して会議録の一覧を取り、
1つの会議録は ACT=203 に HATSUGENMODE=1 を渡して全文を1枚で受け取る。発言の頭には HUID の錨があり、
その後ろが「◆４１番（おおつき城一議員）」「◎区長（岸本聡子）」のような印字、全角の空白の後ろが本文。
委員会では印字が名前だけ（「◆藤本なおや」）なので、話し手の区分は発言の印（自治体ごとの決まり）で決める。
印字の形は自治体ごとに違い、世田谷は「◆中山みずほ　委員　本文」「◎山戸　保健福祉政策部長　本文」と名前と役職を全角の空白で分ける
（議員はどの会議でもフルネーム、姓だけなのは理事者）。この違いは自治体ごとの設定（印の決まり・印字に役職の欄があるか・発言でない印）で吸収する。
名前は冒頭の出席者の欄で確かめる。一覧は100件ずつの頁に分かれるので、ヒットした件数を読み終えるまで頁を送る。閉じた時刻（「午後３時２７分散会」）の後ろの議案説明資料などは発言に含めない。

業者の置く VOICES の多くは robots.txt で CGI（/voices/cgi/ など）を禁じているので、
robots.txt が CGI を禁じていない自治体だけを載せる（2026-11-25 確認）。
- 杉並区（suginami.gijiroku.com）: robots.txt が無い（404）。CGI は /voices/voices/cgi/
- 世田谷区（kugi.city.setagaya.tokyo.jp）: robots.txt が無い（404）。CGI は /voices/CGI/
- 港・台東・大田・板橋・足立・江戸川・調布・町田は User-agent: * に Disallow: /voices/cgi/ があるので載せない
"""
from __future__ import annotations

import re
import urllib.parse
from dataclasses import dataclass, field

from assembly.common import Meeting, Member, Speech, current_reiwa, http, kind_of_body, sha, strip_tags, to_ascii_digits
from assembly.kensaku import classify

ENCODING = 'cp932'
KGTP_SESSIONS = ('1', '2', '3')  # 定例会・臨時会・委員会
MARKS = '○◆◎△◇□■●▲'
# 発言の印が表す話し手。印字が名前だけ（委員会の「◆藤本なおや」）のときに使う。印の決まりは自治体ごとの設定なので、会議録で確かめた自治体だけ持つ。
# 杉並・世田谷の会議録で確かめた決まり
CHAIR_MEMBER_OFFICIAL = {'○': 'chair', '◆': 'member', '◎': 'official'}
# 閉じた時刻の後ろは議案説明資料などの添付で、発言ではない
CLOSING = re.compile(r'^午[前後].+(散会|閉会)$')


@dataclass
class Voices:
    code: str
    cgi: str  # voiweb.exe の URL
    marks: dict[str, str] = field(default_factory=dict)  # 発言の印 -> 話し手の区分
    role_field: bool = False  # 印字が「名前　役職」で、名前の後ろの全角の空白の次の欄が役職（世田谷）
    headings: str = ''  # 発言でない印（世田谷の「△日程第一を上程いたします。」）
    _titles: dict[str, str] = field(default_factory=dict)  # FINO -> 「令和　７年第４回定例会｜11月19日-26号」

    def list_page(self, year: int, kgtp: str, page: int = 1, hit: int = 0) -> str:
        query = {'ACT': '100', 'KTYP': '0,1,2,3', 'SORT': '0', 'FYY': str(year), 'FMM': '', 'FDD': '',
                 'TYY': str(year), 'TMM': '', 'TDD': '', 'KGTP': kgtp}
        if page > 1:
            query |= {'KENSAKU': '0', 'PAGE': str(page), 'HIT': str(hit), 'AHIT': '-1'}
        return http(f'{self.cgi}?{urllib.parse.urlencode(query, safe=",")}', encoding=ENCODING)

    def list_ids(self, from_reiwa: int) -> list[str]:
        """目次（「11月19日-目次」）は発言を持たないので外す。"""
        for n in range(from_reiwa, current_reiwa() + 1):
            for kgtp in KGTP_SESSIONS:
                found = hit = 0
                number = 1
                while number == 1 or found < hit:
                    page = self.list_page(2018 + n, kgtp, number, hit)
                    read = 0
                    for m in re.finditer(r"winopen\('voiweb\.exe\?ACT=200&[^']*?TITL_SUBT=([^&']+)&[^']*?FINO=(\d+)&", page):
                        read += 1
                        title = urllib.parse.unquote(m.group(1), encoding=ENCODING)
                        if not title.endswith('-目次'):
                            self._titles[m.group(2)] = title
                    found += read
                    if m := re.search(r'(\d+)件の日程がヒット', page):
                        hit = int(m.group(1))
                    if read == 0:
                        break
                    number += 1
                if found != hit and hit:
                    raise RuntimeError(f'{self.code} {2018 + n} KGTP={kgtp}: 一覧の {hit} 件のうち {found} 件しか読めない')
        return sorted(self._titles, key=int)

    def url(self, local_id: str) -> str:
        """閲覧の frame の頁（ACT=200）。人が開いて読む先。"""
        return f'{self.cgi}?ACT=200&KENSAKU=0&SORT=0&KTYP=0,1,2,3&FINO={local_id}'

    def download(self, local_id: str) -> str:
        if local_id not in self._titles:
            raise RuntimeError(f'{local_id}: 一覧に無い会議録（--from が会議の年を含むこと）')
        query = {'ACT': '203', 'KENSAKU': '0', 'SORT': '0', 'KTYP': '0,1,2,3',
                 'TITL_SUBT': self._titles[local_id], 'FINO': local_id, 'HATSUGENMODE': '1', 'HYOUJIMODE': '0', 'STYLE': '0'}
        return http(f'{self.cgi}?{urllib.parse.urlencode(query, safe=",", encoding=ENCODING)}', encoding=ENCODING)

    def roster(self, page: str) -> dict[str, Member]:
        """発言者の印字がフルネームなので、名簿を作らずに出席者の欄で確かめる。"""
        return {}

    def parse(self, local_id: str, page: str, members: dict[str, Member]) -> tuple[Meeting, list[Speech]]:
        m = re.search(r'<TITLE>(.*?)</TITLE>', page, flags=re.I | re.S)
        if not m or '－' not in m.group(1):
            raise RuntimeError(f'{local_id}: 会議録の題が無い')
        # 「令和　７年第４回定例会－11月19日-26号」「令和　７年予算特別委員会－03月05日-02号」「令和　７年１２月１２日保健福祉委員会－12月12日-01号」
        name, sub = m.group(1).rsplit('－', 1)
        name = re.sub(r'[\s　]+', ' ', name).strip()
        z = to_ascii_digits(name.replace('元年', '1年'))
        year = re.match(r'^令和\s*(\d+)年', z)
        md = re.match(r'^(\d+)月(\d+)日', to_ascii_digits(sub))
        if not year or not md:
            raise ValueError(f'{local_id}: 日付が読めない: {m.group(1)}')
        held_on = f'{2018 + int(year.group(1))}-{int(md.group(1)):02d}-{int(md.group(2)):02d}'
        # 世田谷は「令和 ８年 ９月 定例会」「令和 ８年 ９月 文教常任委員会」と月だけを挟み、回を書かない
        body_name = re.sub(r'^令和\s*(\S+?)年\s*([０-９\d]+月(\s*[０-９\d]+日)?)?\s*', '', name).strip()
        if re.match(r'^(第\s*\S+\s*回\s*)?(定例会|臨時会)', body_name):
            body_name = '本会議'
        title = f'{name} {sub.strip()}'
        meeting_id = f'{self.code}:{local_id}'
        meeting = Meeting(meeting_id, self.code, title, kind_of_body(body_name), body_name,
                          held_on, self.url(local_id), '', sha(page))

        # 本文は最初の錨から、後ろの FORM・script の手前まで。最初の錨の後ろは発言でなく、会議名と出席者の欄
        start = re.search(r'<A NAME="HUID\d+"></A>', page, flags=re.I)
        if not start:
            return meeting, []
        text = re.split(r'<FORM\b|<SCRIPT\b', page[start.start():], maxsplit=1, flags=re.I)[0]
        parts = re.split(r'<A NAME="HUID\d+"></A>', text, flags=re.I)[1:]
        # 出席者の欄の名前は字の間を空けて揃えてある（「田　　中　ゆうたろう」）。空白を詰めて名前を探す
        attendance = ''
        speeches: list[Speech] = []
        for part in parts:
            lines = strip_tags(part)
            if not lines or lines[0][0] not in MARKS:
                # 発言の印の無い錨は、出席者の欄などの続き
                attendance += re.sub(r'\s', '', ''.join(lines))
                continue
            mark = lines[0][0]
            if mark in self.headings:
                continue
            # 印字は最初の全角の空白まで。「四十九番（岡本のぶ子　議員）」のように括弧の中にも空白があるので括弧を閉じるまで、
            # 役職の欄がある自治体は括弧で役職を閉じていなければ次の欄まで（「中山みずほ　委員」）
            fields = lines[0][1:].split('　')
            take = 1
            while take < len(fields) and ''.join(fields[:take]).count('（') > ''.join(fields[:take]).count('）'):
                take += 1
            if self.role_field and take < len(fields) and not ''.join(fields[:take]).endswith('）'):
                take += 1
            label = re.sub(r'[\s　]', '', ''.join(fields[:take]))
            rest = '　'.join(fields[take:])
            speaker_kind, member_name = classify(label, attendance)
            if speaker_kind == 'other' and mark in self.marks:
                speaker_kind = self.marks[mark]
                if speaker_kind in ('member', 'chair') and len(label) >= 2 and label in attendance:
                    member_name = label
            body: list[str] = []
            for line in ([rest] if rest.strip() else []) + lines[1:]:
                line = line.strip('　 ')
                if CLOSING.match(line):
                    break
                if not re.match(r'^([（〔].*[）〕]|午[前後].+(休憩|開議|再開|開会))$', line):
                    body.append(line)
            text_body = '\n'.join(body)
            speeches.append(Speech(meeting_id, len(speeches) + 1, label, speaker_kind, member_name, text_body))
        return meeting, speeches


VOICES = [
    Voices('131156', 'https://suginami.gijiroku.com/voices/voices/cgi/voiweb.exe', CHAIR_MEMBER_OFFICIAL),
    Voices('131121', 'https://kugi.city.setagaya.tokyo.jp/voices/CGI/voiweb.exe', CHAIR_MEMBER_OFFICIAL, role_field=True, headings='△'),
]
