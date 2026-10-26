import glob
from pathlib import Path
import re
import subprocess


def find_mutool(self):
    for candidate in glob.glob('/Users/*/Library/pipx/venvs/mupdf*/bin/mutool') \
            + glob.glob(str(Path.home() / '.local/share/mise/installs/conda-mupdf/*/bin/mutool')) \
            + glob.glob('/opt/homebrew/bin/mutool') + glob.glob('/usr/local/bin/mutool'):
        if Path(candidate).exists():
            return candidate
    import shutil
    found = shutil.which('mutool')
    if not found:
        raise ValueError('mutool not found')
    return found


def trace_words(self, pdf, first, last):
    """Visible words per physical page, rebuilt from `mutool trace` glyphs.

    The imposition draws the whole spread's text twice under two page-half
    clip rects (left clip for pass A, right clip for pass B). Glyphs drawn
    outside their enclosing clip produce no ink, so the real layer is exactly
    the set of glyphs inside their page-half clip. Words are assembled from
    those glyphs; poppler word boxes are unusable here because it merges
    phantom and real glyphs into one word at the pass boundary.
    """
    out = subprocess.run([self.rule('find_mutool')(), 'trace', str(pdf), f'{first}-{last}'],
                         capture_output=True, check=True).stdout.decode('utf-8', 'replace')
    pages = {}
    for page_match in re.finditer(r'<page number="(\d+)"[^>]*>(.*?)</page>', out, re.S):
        page = int(page_match.group(1))
        seg = page_match.group(2)
        stack = []          # [is_page_clip, xlo, xhi, text_count]
        passes = []         # text-element count inside each page-half clip
        glyphs = {}         # visible: (unicode, x, baseline_y) -> advance width
        all_ink = {}        # every drawn glyph, for single-pass pages
        stats = {'描画glyph数': 0, 'clipA内': 0, 'clipB内': 0,
                 'clip無し': 0, 'clip外（幽霊）': 0}
        for m in self.TRACE_TAG.finditer(seg):
            if m.group(4) is not None:                   # clip_path element
                tm = re.search(r'transform="([^"]*)"', m.group(0))
                a, b, c, d, e, f = ([float(v) for v in tm.group(1).split()]
                                    if tm else (1, 0, 0, 1, 0, 0))
                xs = [float(v) for v in re.findall(r'x="(-?[\d.]+)"', m.group(4))]
                ys = [float(v) for v in re.findall(r'y="(-?[\d.]+)"', m.group(4))]
                if xs and ys:
                    dev = [(a * x + c * y + e, b * x + d * y + f) for x, y in zip(xs, ys)]
                    # A page-half clip is tall and narrower than the spread; a
                    # clip around the whole spread (some printings add one) owns
                    # no pass and must not count as an empty one.
                    entry = [max(y for _, y in dev) - min(y for _, y in dev) > 700
                             and max(x for x, _ in dev) - min(x for x, _ in dev) < 800,
                             min(x for x, _ in dev), max(x for x, _ in dev), 0]
                    stack.append(entry)
                    if entry[0]:
                        passes.append(entry)
            elif m.group(0).startswith('<pop'):
                if stack:
                    stack.pop()
            else:                                        # text element
                tm = re.search(r'transform="([^"]*)"', m.group(2) or '')
                a, b, c, d, e, f = ([float(v) for v in tm.group(1).split()]
                                    if tm else (1, 0, 0, 1, 0, 0))
                endpos = seg.find('</' + m.group(1) + '>', m.end())
                body = seg[m.end():endpos if endpos > 0 else len(seg)]
                big = [s for s in stack if s[0]]
                clip = big[-1] if big else None
                if clip is not None:
                    clip[3] += 1
                for span in self.SPAN.finditer(body):
                    trm = [float(v) for v in span.group(1).split()]
                    size = trm[0]
                    for g in self.GLYPH.finditer(span.group(2)):
                        stats['描画glyph数'] += 1
                        u, x, y = g.group(1), float(g.group(2)), float(g.group(3))
                        adv = float(g.group(4))
                        dx, dy = a * x + c * y + e, b * x + d * y + f
                        all_ink[(u, round(dx, 2), round(dy, 2))] = (size * adv, size)
                        if clip is None:
                            stats['clip無し'] += 1
                            glyphs[(u, round(dx, 2), round(dy, 2))] = (size * adv, size)
                        elif clip[1] - .5 <= dx <= clip[2] + .5:
                            stats['clipA内' if clip[1] < 300 else 'clipB内'] += 1
                            glyphs[(u, round(dx, 2), round(dy, 2))] = (size * adv, size)
                        else:
                            stats['clip外（幽霊）'] += 1
        # Some pages draw the whole spread once inside the first half clip; the
        # later clip then holds only a page-number strip. There every drawn
        # glyph is real ink and clip membership must not filter words.
        if len(passes) >= 2 and min(p[3] for p in passes) * 20 < max(p[3] for p in passes):
            glyphs = all_ink
            stats['単一描画頁（clip判定なし）'] = True
        rows = {}
        for (u, x, y), (w, size) in glyphs.items():
            key = next((k for k in rows if abs(k - y) < .3), None)
            rows.setdefault(key if key is not None else y, []).append((x, u, w, size, y))
        words = []
        for baseline, row in rows.items():
            row.sort()
            current = None
            for x, u, w, size, y in row:
                if current and x - current['xMax'] > 1.5:
                    words.append(current)
                    current = None
                if not current:
                    current = {'text': u, 'xMin': x, 'xMax': x + w,
                               'yMin': y - .88 * size, 'yMax': y + .12 * size}
                else:
                    current['text'] += u
                    current['xMax'] = x + w
                    current['yMin'] = min(current['yMin'], y - .88 * size)
                    current['yMax'] = max(current['yMax'], y + .12 * size)
            if current:
                words.append(current)
        stats['可視glyph数（clip内）'] = len(glyphs)
        stats['組立単語数'] = len(words)
        pages[page] = {'words': words, 'stats': stats}
    if set(pages) != set(range(first, last + 1)):
        raise ValueError('Incomplete mutool trace page range')
    return sorted(pages.items())

FUNCTIONS = {
    'find_mutool': find_mutool,
    'trace_words': trace_words,
}
