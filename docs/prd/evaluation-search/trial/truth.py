"""評価の資料の印字から、正解の集合（事業名と頁）を作る。

使い方: python truth.py <北区のPDF> <中野区の別冊のPDF> <出力dir>
北区は各頁の「事業名︓」、中野区は「施策 N 名前」の頁（続きの頁を含む）と、①〜で始まる主な事業の取組名を拾う。
"""
import json, re, subprocess, sys

def page_text(pdf, p):
    return subprocess.run(['pdftotext', '-f', str(p), '-l', str(p), '-layout', pdf, '-'], capture_output=True, text=True).stdout

def pages(pdf):
    out = subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout
    return int(re.search(r'^Pages:\s+(\d+)', out, re.M).group(1))

kita, nakano, out = sys.argv[1:4]
k = []
for p in range(1, pages(kita) + 1):
    m = re.search(r'事業名[︓:：]\s*(.+?)(?:\s{2,}|$)', page_text(kita, p), re.M)
    if m:
        k.append({'page': p, 'name': m.group(1).strip()})
n, cur = [], None
for p in range(1, pages(nakano) + 1):
    t = page_text(nakano, p)
    m = re.search(r'^\s*施策\s+(\d+)\s+(\S.*?)\s*$', t, re.M)
    if m:
        cur = {'kind': '施策', 'no': int(m.group(1)), 'name': ' '.join(m.group(2).split()), 'page': p}
        n.append(dict(cur, pages=[p]))
    elif cur and len(t.strip()) > 500:
        n[-1]['pages'].append(p)
    for g in re.findall(r'^\s*([①-⑳])(\S[^\s].*?)\s*$', t, re.M):
        name = g[1].strip()
        if len(name) >= 4 and not re.match(r'^[\d,.%\s]+$', name) and '年度' not in name:
            n.append({'kind': '取組', 'name': name, 'page': p, 'pages': [p]})
json.dump(k, open(f'{out}/kita_truth.json', 'w'), ensure_ascii=False, indent=1)
json.dump(n, open(f'{out}/nakano_truth.json', 'w'), ensure_ascii=False, indent=1)
