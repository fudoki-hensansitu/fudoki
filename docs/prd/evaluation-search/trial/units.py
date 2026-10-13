"""評価の資料の印字から、評価の単位（事業・施策・取組・主な事業・主な課題）の一覧を作る。第2段の問いと正解の元。

使い方: uv run --project pipeline python units.py <北区のPDF> <中野区の本冊のPDF> <中野区の別冊のPDF> <出力dir>
出力: units.json（各要素 {jurisdiction, kind, name, page_id, parent, section}）と、目の対応づけの担当に渡した一覧
units_kita.tsv・units_nakano.tsv。名前と頁だけで、本文は持たない。原典の抜き出しなので commit しない（PDF から作り直せる）。
"""
import json, re, subprocess, sys
import pdfplumber

KITA_SHA, HON_SHA, BETSU_SHA = '80b62f85965f', '628b02ba7d8f', 'f3b089e84c0b'


def page_text(pdf, p):
    return subprocess.run(['pdftotext', '-f', str(p), '-l', str(p), '-layout', pdf, '-'], capture_output=True, text=True).stdout


def field(t, label):
    m = re.search(label + r'\s*[︓:：]?\s*(\S.*?)(?:\s{2,}|$)', t, re.M)
    return m.group(1).strip() if m else None


def kita(pdf):
    out = []
    with pdfplumber.open(pdf) as doc:
        n = len(doc.pages)
    for p in range(1, n + 1):
        t = page_text(pdf, p)
        name = field(t, '事業名')
        if not name or not field(t, '中期計画番号'):  # 8・9頁の一覧表は除く
            continue
        out.append({'jurisdiction': '131172', 'kind': '事業', 'name': name, 'page_id': f'{KITA_SHA}:{p}',
                    'parent': field(t, r'^\s*施策'), 'section': field(t, '主管課')})
    return out


def nakano_hon(pdf):
    """本冊の「主な課題の実施状況」の見出し「(n) 名前（課）」。"""
    out = []
    with pdfplumber.open(pdf) as doc:
        n = len(doc.pages)
    for p in range(1, n + 1):
        for m in re.finditer(r'^\s*\((\d+)\)\s*(\S.*?)（([^（）]*?課[^（）]*?)）\s*$', page_text(pdf, p), re.M):
            out.append({'jurisdiction': '131148', 'kind': '主な課題', 'name': m.group(2).strip(), 'page_id': f'{HON_SHA}:{p}',
                        'parent': None, 'section': m.group(3)})
    return out


def lines(chars, gap=3):
    """chars を行（top の近いもの）にまとめ、(top, 文字列) の並びで返す。"""
    rows = []
    for c in sorted(chars, key=lambda c: (round(c['top']), c['x0'])):
        if rows and abs(rows[-1][0] - c['top']) < gap:
            rows[-1][1].append(c)
        else:
            rows.append([c['top'], [c]])
    return [(top, ''.join(ch['text'] for ch in sorted(cs, key=lambda c: c['x0']))) for top, cs in rows]


def nakano_betsu(pdf):
    """別冊の施策（続きの頁を含む）、取組（①〜）、主な事業の行の名前と所管課。"""
    out, cur, torikumi = [], None, None
    with pdfplumber.open(pdf) as doc:
        for i, pg in enumerate(doc.pages):
            p = i + 1
            t = page_text(pdf, p)
            m = re.search(r'^\s*施策\s+(\d+)\s+(\S.*?)\s*$', t, re.M)
            if m:
                cur = {'jurisdiction': '131148', 'kind': '施策', 'name': ' '.join(m.group(2).split()), 'page_id': f'{BETSU_SHA}:{p}',
                       'pages': [f'{BETSU_SHA}:{p}'], 'parent': None, 'section': None, 'no': int(m.group(1))}
                out.append(cur)
            elif cur and len(t.strip()) > 500:
                cur['pages'].append(f'{BETSU_SHA}:{p}')
            else:
                continue
            words = pg.extract_words()
            hdr = [w for w in words if w['text'] == '主な事業' and w['x0'] < 120]
            top0 = hdr[0]['top'] + 20 if hdr else 0
            # 列の左端（名前）と右端（所管課）だけを見る
            left = [c for c in pg.chars if c['x0'] < 125 and c['top'] > top0]
            right = [c for c in pg.chars if c['x0'] > 1030 and c['top'] > top0]
            rlines = lines(right)
            pending = None
            for top, s in lines(left) + [(1e9, '')]:
                if pending and (top - pending[1] > 9 or re.match(r'^[①-⑳]', s)):
                    name = pending[0]
                    if not re.match(r'^[\d,.%\s―]', name):
                        sec = min(rlines, key=lambda r: abs(r[0] - pending[2]))[1] if rlines else None
                        out.append({'jurisdiction': '131148', 'kind': '主な事業', 'name': name, 'page_id': f'{BETSU_SHA}:{p}',
                                    'parent': cur['name'], 'torikumi': torikumi, 'section': sec})
                    pending = None
                if not s:
                    continue
                if re.match(r'^[①-⑳]', s):
                    full = [w['text'] for w in words if abs(w['top'] - top) < 3 and w['x0'] < 600]
                    torikumi = ''.join(full)[1:]
                    out.append({'jurisdiction': '131148', 'kind': '取組', 'name': torikumi, 'page_id': f'{BETSU_SHA}:{p}',
                                'parent': cur['name'], 'section': None})
                    continue
                if pending:
                    pending = (pending[0] + s, top, pending[2])
                else:
                    pending = (s, top, top)
    return out


kita_pdf, hon_pdf, betsu_pdf, outdir = sys.argv[1:5]
units = kita(kita_pdf) + nakano_hon(hon_pdf) + nakano_betsu(betsu_pdf)
json.dump(units, open(f'{outdir}/units.json', 'w'), ensure_ascii=False)
for j, fn in [('131172', 'kita'), ('131148', 'nakano')]:
    rows = []
    for x in (u for u in units if u['jurisdiction'] == j):
        if x['kind'] == '事業':
            rows.append(f"{x['page_id']}\t事業\t{x['name']}\t施策:{x['parent']}\t主管課:{x['section']}")
        elif x['kind'] == '施策':
            rows.append(f"{','.join(x['pages'])}\t施策{x['no']}\t{x['name']}")
        elif x['kind'] == '取組':
            rows.append(f"{x['page_id']}\t 取組\t{x['name']}\t(施策:{x['parent']})")
        elif x['kind'] == '主な事業':
            rows.append(f"{x['page_id']}\t  主な事業\t{x['name']}\t所管課:{x['section']}\t(取組:{x.get('torikumi')})")
        else:
            rows.append(f"{x['page_id']}\t本冊・主な課題の実施状況\t{x['name']}\t課:{re.sub(r'\s', '', x['section'])}")
    open(f'{outdir}/units_{fn}.tsv', 'w').write('\n'.join(rows) + '\n')
from collections import Counter
print(Counter((u['jurisdiction'], u['kind']) for u in units))
