"""島しょの町村の、PDF で出している会議録（神津島村・利島村・八丈町）。

どこも本会議（定例会・臨時会）の会議録を、文字の読める PDF で町村のサイトに置いている。神津島・利島は会期ごとに1冊、
八丈は会議の日（号）ごとに1冊。robots.txt にも町村のサイトにも取得や転載を禁じる文言は無い（2026-11-27 確認）。
1冊を1つの会議として持ち、開催日は冊の初日にする。キャッシュには PDF から取り出した文字を置く。

大島町・新島村・三宅村・御蔵島村は会議録をサイトに出しておらず（議会だより・結果・年報だけ）、青ヶ島村はサイトに議会の頁が無い。
小笠原村は DiscussNet で robots.txt が禁じる（2026-11-27 確認）。
"""
from __future__ import annotations

import html as html_lib
import re
import urllib.error

import pypdfium2

from assembly.common import Unreadable, Meeting, Member, Speech, current_reiwa, http, http_bytes, reiwa_date, sha, to_ascii_digits

# 「〇４番（井口 保君）」「○総務課長（兼務）（榎本雅仁君）」。印は○（U+25CB）と〇（U+3007）の両方がある
SPEAKER = re.compile(r'^[○〇]([^\n]{1,60}?（[^（）\n]{1,30}?(?:君|議員)）)[\s　]*(.*)$')
PAGE_NUMBER = re.compile(r'^[\s　]*[-－‐―]\s*[0-9０-９]+\s*[-－‐―][\s　]*$')
REIWA_YEAR = re.compile(r'令和\s*([0-9０-９元]+)\s*年')


def pdf_text(raw: bytes) -> str:
    """頁ごとの文字を、印字の順に取り出して改行でつなぐ。頁番号の行は外す。"""
    doc = pypdfium2.PdfDocument(raw)
    lines: list[str] = []
    for page in doc:
        text = page.get_textpage().get_text_range().replace('\r\n', '\n').replace('\r', '\n')
        lines += [l.rstrip() for l in text.split('\n') if l.strip() and not PAGE_NUMBER.match(l)]
    return '\n'.join(lines)


def reiwa_of(text: str) -> int | None:
    m = REIWA_YEAR.search(to_ascii_digits(text).replace('元', '1'))
    return int(m.group(1)) if m else None


def squeeze(text: str) -> str:
    return re.sub(r'[\s　]', '', text)


def roster(text: str) -> dict[str, Member]:
    """「１番 小 林 正吾郎 君」の出席・応招議員の欄から、会議に出た議員の名前を集める。"""
    found: dict[str, Member] = {}
    for m in re.finditer(r'[0-9０-９]+番[\s　]+([^君\n]{1,20}?)[\s　]*君', text):
        name = squeeze(m.group(1))
        if 2 <= len(name) <= 8 and not re.search(r'[（）、。]', name):
            found[name] = Member(name, '')
    return found


def parse_minutes(meeting_id: str, code: str, url: str, text: str, fallback_title: str,
                  members: dict[str, Member]) -> tuple[Meeting, list[Speech]]:
    lines = text.split('\n')
    first = next((i for i, l in enumerate(lines) if SPEAKER.match(l)), None)
    if first is None:
        raise Unreadable(f'{meeting_id}: 発言の印が文字として取れない（画像だけの PDF）')
    # 表紙は縦書きで文字の順が崩れるので、題と日付は1行の中だけで探す
    squeezed = [squeeze(l) for l in lines]
    title = next((m.group(0) for l in squeezed if (m := re.match(r'令和[0-9０-９元]+年第[0-9０-９一二三四五六七八九十]+回.+?(?:定例会|臨時会)', l))), fallback_title)
    # 会期の初日は、曜日の括弧が続く最初の日付（招集告示の「令和８年６月９日（火）」・議事日程の「令和８年９月２日（水曜日）」）
    date_m = next((m for l in squeezed if (m := re.search(r'令和[0-9０-９元]+年[0-9０-９]+月[0-9０-９]+日（', l))), None)
    if not date_m:
        raise ValueError(f'{meeting_id}: 開催日が読めない')
    held_on = reiwa_date(date_m.group(0))

    head = lines[:first]
    # 議事日程は、目次（点線の行）ではない最初の「議事日程」から、出席議員の欄まで
    start = next((i for i, l in enumerate(head) if '議事日程' in squeeze(l) and not re.search(r'[…·・]{3,}', l)), -1)
    agenda_lines: list[str] = []
    if start != -1:
        for l in head[start + 1:]:
            if re.match(r'^[\s　]*(出席議員|欠席議員|応招)', l):
                break
            agenda_lines.append(l.strip())
    meeting = Meeting(meeting_id, code, title, 'plenary', '本会議', held_on, url, '\n'.join(agenda_lines), sha(text))

    speeches: list[Speech] = []
    label: str | None = None
    paragraphs: list[str] = []

    def flush() -> None:
        if label is None:
            return
        body = '\n'.join(p for p in paragraphs if p)
        speaker_kind, member_name = classify(label, members)
        speeches.append(Speech(meeting_id, len(speeches) + 1, label, speaker_kind, member_name, body))

    for line in lines[first:]:
        if m := SPEAKER.match(line):
            flush()
            label = squeeze(m.group(1))
            paragraphs = [m.group(2).strip()]
            continue
        stripped = line.strip()
        # 会期の2日目からは、冊の途中に「令和７年１２月１２日（第２号）」「議事日程第２号」と会期の題・議事日程・出席議員の欄が入る。
        # 前の日の最後の発言をそこで閉じ、次の話し手の印までは発言として読まない
        if re.match(r'^(令和\S+日（第[0-9０-９]+号）$|議事日程(（第[0-9０-９]+号）$|第[0-9０-９]+号)|令和\S+年第\S+回\S+(定例会|臨時会)(会議録)?$)', squeeze(stripped)):
            flush()
            label = None
            continue
        # ◎の見出し・〔登壇〕などのト書き・（午前９時３２分）の時刻は発言ではない
        if re.match(r'^(◎|〔.*〕$|（(午前|午後).*）$|─{5,})', stripped) or label is None:
            continue
        # 段落の頭は字下げ（先頭の空白）。字下げの無い行は前の行の折り返しなので、そのままつなぐ
        if line[:1] in (' ', '　') or not paragraphs:
            paragraphs.append(stripped)
        else:
            paragraphs[-1] += stripped
    flush()
    return meeting, speeches


def classify(label: str, members: dict[str, Member]) -> tuple[str, str | None]:
    """括弧の中の名前が出席議員の欄にあれば議員（議長・副議長は進行）。無ければ理事者として名前を持たない。"""
    m = re.match(r'^(.*)（([^）]+?)(?:君|議員)）$', label)
    if not m:
        return 'other', None
    role, name = m.group(1), m.group(2)
    known = name if name in members else None
    if re.match(r'^(議長|副議長)', role):
        return 'chair', known
    # 「１２番（…君）」は議席番号なので、名簿で引けなくても議員。名前は名簿で決まるときだけ入れる（引けなければ数えて見えるようにする）
    if re.match(r'^[0-9０-９]+番$', role) or known:
        return 'member', known
    return 'official', None


class Kozushima:
    """神津島村。議会の頁に会議録の記事が並び、記事ごとに PDF が1冊付く。"""
    code = '133647'
    base = 'https://www.vill.kouzushima.tokyo.jp'
    index = f'{base}/busyo/gikai/'

    def list_ids(self, from_reiwa: int) -> list[str]:
        page = http(self.index)
        ids = set()
        for href, label in re.findall(r'<a[^>]+href="https://www\.vill\.kouzushima\.tokyo\.jp/([0-9-]+)/"[^>]*>([^<]*会議録[^<]*)', page):
            if (reiwa_of(label) or 0) >= from_reiwa:
                ids.add(href)
        return sorted(ids)

    def url(self, local_id: str) -> str:
        return f'{self.base}/{local_id}/'

    def download(self, local_id: str) -> str:
        post = http(self.url(local_id))
        pdfs = sorted(set(re.findall(r'href="(https://www\.vill\.kouzushima\.tokyo\.jp/images/[^"]+\.pdf)"', post)))
        if len(pdfs) != 1:
            raise ValueError(f'{local_id}: 会議録の PDF が1冊に決まらない（{pdfs}）')
        return pdf_text(http_bytes(pdfs[0]))

    def roster(self, page: str) -> dict[str, Member]:
        # 姓と名の境が印字から決まらないので、議員の表（姓・名を持つ）には入れない。名前は会議ごとの出席議員の欄で決める
        return {}

    def parse(self, local_id: str, page: str, members: dict[str, Member]) -> tuple[Meeting, list[Speech]]:
        return parse_minutes(f'{self.code}:{local_id}', self.code, self.url(local_id), page, '神津島村議会会議録', roster(page))


class ToshimaMura:
    """利島村。議会情報の頁に、年の見出しの下へ議案書と議事録の PDF が並ぶ。議事録の中身は会議録の様式。"""
    code = '133621'
    base = 'https://www.toshimamura.org'
    index = f'{base}/about/assembly.html'

    def list_ids(self, from_reiwa: int) -> list[str]:
        page = http(self.index)
        ids = []
        reiwa = None
        for m in re.finditer(r'<h\d[^>]*>(.*?)</h\d>|<a[^>]+href="(/fs/[0-9/]+/_/[^"]+\.pdf)"[^>]*>([^<]*)', page, re.S):
            if m.group(1) is not None:
                reiwa = reiwa_of(re.sub(r'<[^>]+>', '', m.group(1))) or reiwa
            elif '議事録' in html_lib.unescape(m.group(3)) and (reiwa or 0) >= from_reiwa:
                local_id = self.local_id(m.group(2))
                self._paths[local_id] = self.base + m.group(2)
                ids.append(local_id)
        return sorted(set(ids))

    @staticmethod
    def local_id(path: str) -> str:
        # /fs/3/5/9/9/8/9/_/2606_2_______.pdf の数字の部分（359989）がファイルの番号
        return ''.join(re.findall(r'\d', path.split('/_/')[0]))

    def __init__(self) -> None:
        self._paths: dict[str, str] = {}  # list_ids が埋める。local id -> PDF の URL

    def url(self, local_id: str) -> str:
        return self._paths[local_id]

    def download(self, local_id: str) -> str:
        return pdf_text(http_bytes(self.url(local_id)))

    def roster(self, page: str) -> dict[str, Member]:
        # 姓と名の境が印字から決まらないので、議員の表（姓・名を持つ）には入れない。名前は会議ごとの出席議員の欄で決める
        return {}

    def parse(self, local_id: str, page: str, members: dict[str, Member]) -> tuple[Meeting, list[Speech]]:
        return parse_minutes(f'{self.code}:{local_id}', self.code, self.url(local_id), page, '利島村議会会議録', roster(page))


class Hachijo:
    """八丈町。年ごとの頁（r8-kairoku）に、会期の見出しの下へ号ごとの PDF が「１号 Ｒ8.9.4」の名前で並ぶ。"""
    code = '134015'
    base = 'https://www.town.hachijo.tokyo.jp/chousei/chougikai/katsushin/kaigi-kiroku/kairoku'

    def __init__(self) -> None:
        self._pdfs: dict[str, tuple[str, str]] = {}  # list_ids が埋める。local id -> (PDF の URL, 号の名前「第1号」)

    def list_ids(self, from_reiwa: int) -> list[str]:
        for reiwa in range(from_reiwa, current_reiwa() + 1):
            try:
                page = http(f'{self.base}/r{reiwa}-kairoku/')
            except urllib.error.HTTPError as error:
                # 年の頁は、その年の最初の会議録が載るまで無い（404）。無い年は会議が無いものとして飛ばす
                if error.code == 404:
                    continue
                raise
            for m in re.finditer(r'<a[^>]+href="([^"]+\.pdf)"[^>]*>(.*?)</a>', page, re.S):
                label = to_ascii_digits(re.sub(r'<[^>]+>', '', m.group(2))).translate(str.maketrans('ＲＨ．', 'RH.'))
                d = re.search(r'R\s*(\d+)\.(\d+)\.(\d+)', label)
                if not d:
                    raise ValueError(f'八丈の会議録の名前から日付が読めない: {label}')
                local_id = f'r{int(d.group(1)):02d}_{int(d.group(2)):02d}{int(d.group(3)):02d}'
                if local_id in self._pdfs:
                    raise ValueError(f'八丈の会議録で同じ日が2冊ある: {local_id}')
                gou = re.match(r'\s*(\d+)号', label)
                self._pdfs[local_id] = (m.group(1), f'第{gou.group(1)}号' if gou else '')
        return sorted(self._pdfs)

    def url(self, local_id: str) -> str:
        return self._pdfs[local_id][0]

    def download(self, local_id: str) -> str:
        return pdf_text(http_bytes(self.url(local_id)))

    def roster(self, page: str) -> dict[str, Member]:
        return {}

    def parse(self, local_id: str, page: str, members: dict[str, Member]) -> tuple[Meeting, list[Speech]]:
        meeting, speeches = parse_minutes(f'{self.code}:{local_id}', self.code, self.url(local_id), page, '八丈町議会会議録', roster(page))
        # 号ごとの冊なので、開催日は冊の題の日付（会期の初日）ではなく、一覧の名前の日付
        m = re.match(r'r(\d+)_(\d{2})(\d{2})', local_id)
        meeting.held_on = f'{2018 + int(m.group(1))}-{m.group(2)}-{m.group(3)}'
        if gou := self._pdfs[local_id][1]:
            meeting.title += f'（{gou}）'
        return meeting, speeches


ISLANDS = [Kozushima(), ToshimaMura(), Hachijo()]
