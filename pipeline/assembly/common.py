"""会議録の取り込みで、議会のシステムをまたいで使う型と道具。"""
from __future__ import annotations

import hashlib
import html as html_lib
import re
import time
import urllib.parse
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import date

FETCH_INTERVAL_SECONDS = 3.0  # 議会のサイトに負荷をかけないよう、1本ずつ3秒空けて取る
USER_AGENT = 'fudoki-assembly-ingest'
RETRIES = 4


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


def http(url: str, data: dict | None = None, encoding: str = 'utf-8') -> str:
    """data があれば POST。値が list なら同じ名前で繰り返す。送る値も受け取る本文も encoding で扱う。"""
    body = urllib.parse.urlencode(data, doseq=True, encoding=encoding).encode('ascii') if data else None
    request = urllib.request.Request(url, data=body, headers={'User-Agent': USER_AGENT})
    for attempt in range(1, RETRIES + 1):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                raw = response.read()
            break
        except urllib.error.HTTPError as error:
            # 4xx は取り直しても変わらない（tenant や Code の取り違え）。すぐ止める
            if error.code < 500 or attempt == RETRIES:
                raise
            print(f'  取得に失敗（{attempt} 回目、{error}）。{attempt * 10} 秒後に取り直す', flush=True)
            time.sleep(attempt * 10)
        except (urllib.error.URLError, ConnectionError, TimeoutError) as error:
            # 議会のサイトは時々接続を切る。間を空けて取り直し、続けて落ちたら止める
            if attempt == RETRIES:
                raise
            print(f'  取得に失敗（{attempt} 回目、{error}）。{attempt * 10} 秒後に取り直す', flush=True)
            time.sleep(attempt * 10)
    time.sleep(FETCH_INTERVAL_SECONDS)
    # 文字コードを取り違えたら化けた本文を D1 に入れず、ここで止める
    return raw.decode(encoding)


def strip_tags(t: str) -> list[str]:
    """HTML を本文の行にする。入れ子の崩れた印も残さないよう、タグが無くなるまで外す。ここで作るのは表示用の HTML ではなく本文の文字。"""
    t = re.sub(r'<br\s*/?>', '\n', t, flags=re.I)
    t = re.sub(r'</(p|div|li|h\d|tr)>', '\n', t, flags=re.I)
    prev = None
    while prev != t:
        prev, t = t, re.sub(r'<[^>]*>', '', t)
    t = html_lib.unescape(t).replace('\xa0', ' ')
    return [line.strip() for line in t.split('\n') if line.strip()]


def to_ascii_digits(text: str) -> str:
    return text.translate(str.maketrans('０１２３４５６７８９', '0123456789'))


def current_reiwa() -> int:
    return date.today().year - 2018


def reiwa_date(text: str) -> str:
    """「令和 8年 2月24日」「令和８年２月２４日」「令和元年」を ISO の日付にする。"""
    z = to_ascii_digits(text).replace('元年', '1年')
    y = re.search(r'令和\s*(\d+)年', z)
    md = re.search(r'(\d+)月\s*(\d+)日', z)
    if not y or not md:
        raise ValueError(f'日付が読めない: {text}')
    return f'{2018 + int(y.group(1))}-{int(md.group(1)):02d}-{int(md.group(2)):02d}'


def kind_of_body(body_name: str) -> str:
    """会議体の名前から会議の種類を決める。plenary・budget・settlement・committee・special・steering。"""
    if body_name == '本会議':
        return 'plenary'
    if body_name.startswith('予算'):
        return 'budget'
    if body_name.startswith('決算'):
        return 'settlement'
    if body_name.startswith('議会運営'):
        return 'steering'
    return 'special' if '特別委員会' in body_name else 'committee'
