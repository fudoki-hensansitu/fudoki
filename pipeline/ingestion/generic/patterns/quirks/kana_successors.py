"""Document quirk: OCR misreads the katakana numbering of a line (足立区 R5 当初予算の説明). It reads it as the kanji of
the same shape (`工` for エ, `才` for オ, `力` for カ: `工 感染症予防`, `力）再任用職員`), or runs it into a name that
begins with kana (`イファミリー学級`, `アこんにちは赤ちゃん訪問`), so that the line has no numbering of its own. A
line's first word that stands in the column of the katakana numbering above it (its left edge within `COLUMN`) and
reads as the next katakana of that numbering is read again as the katakana, set a space apart from the name; a
katakana OCR read as a line of its own before a name that begins with kana is put before that name. The numbering
runs on over the pages, in reading order. A reading a fuller re-read superseded stays as it is. Read by
`scan.read_pages`."""
import re

from ingestion.generic.patterns.quirks.explained_projects import KANA, KANA_SHAPES
from ingestion.lib.ocr_ink import superseded

SCOPE = 'document'
OPTIONS = {'const': True}

COLUMN = 5.0  # pt: how far the starts of one numbering's katakana lie apart
KANA_START = re.compile(r'[ァ-ヶぁ-ゟー]')
LEAD = re.compile(r'([^\s)）])([)）]?)(\s*)(.*)')


def _numbering(text: str) -> tuple[str, str, str] | None:
    """(katakana, bracket, rest) of a word that opens with a katakana or its kanji of the same shape."""
    found = LEAD.fullmatch(text)
    if not found:
        return None
    kana = found.group(1).translate(KANA_SHAPES)
    return (kana, found.group(2), found.group(4)) if kana in KANA else None


def read(observation: dict) -> dict:
    last: list[tuple[float, str, str]] = []  # (left edge, bracket, katakana) of each numbering column seen
    pages = []
    for page in observation['pages']:
        replaced = superseded(page)
        lines = []
        for region in page['regions']:
            words = {}
            for o in region['observations']:
                if o['kind'] == 'word' and o.get('parent_id') and o.get('bbox_pdf_pt'):
                    words.setdefault(o['parent_id'], []).append(o)
            for o in region['observations']:
                if o['kind'] == 'region' and o.get('bbox_pdf_pt') and o['id'] not in replaced and words.get(o['id']):
                    lines.append((o, min(words[o['id']], key=lambda w: w['bbox_pdf_pt'][0])))
        changed: dict[str, tuple[str, str]] = {}  # observation id: (text read, text read again)
        merged: dict[str, tuple[str, float]] = {}  # line id: (katakana, left edge) put before it
        dropped: set[str] = set()  # the lines of a katakana alone put before the next line, and their words
        # The left and right pages of a sheet sit at other x: a column is placed from the page's leftmost line.
        margin = min((first['bbox_pdf_pt'][0] for _, first in lines), default=0.0)
        for line, first in sorted(lines, key=lambda pair: (pair[0]['bbox_pdf_pt'][1], pair[0]['bbox_pdf_pt'][0])):
            read_as = _numbering(first['raw_text'])
            if read_as is None:
                continue
            kana, bracket, rest = read_as
            x0, y0, _, y1 = first['bbox_pdf_pt']
            # Paddle boxes a katakana from its left edge, narrowly; a kanji, the whole character: its middle is
            # where the katakana it stands for starts.
            left = (x0 if first['raw_text'][:1] in KANA else x0 + (y1 - y0) / 2) - margin
            near = [(abs(x - left), i) for i, (x, b, _) in enumerate(last) if abs(x - left) <= COLUMN and b == bracket]
            column = min(near)[1] if near else None
            plain = first['raw_text'][:1] in KANA and (not rest or first['raw_text'][1 + len(bracket):][:1].isspace())
            if not plain:
                above = last[column][2] if column is not None else None
                # A numbering starts again at ア in a column it was seen in.
                if above is None or (KANA.find(kana) != KANA.find(above) + 1 and kana != KANA[0]):
                    continue
            # The katakana set a space apart from what follows it, in its word or the next (`ウ` `スマイルママ面接`).
            again = f'{kana}{bracket} {rest}'
            if line['raw_text'].strip() == first['raw_text'].strip() and not rest:
                # A katakana alone on its line before a name OCR read as a line of its own that begins with kana
                # (`ウ` `スマイルママ面接`): put before that name, as OCR reads it in one line (`イ 未熟児…`).
                height = y1 - y0
                after = [(o, w) for o, w in lines if o is not line and w['bbox_pdf_pt'][0] > x0
                         and min(y1, w['bbox_pdf_pt'][3]) - max(y0, w['bbox_pdf_pt'][1]) >= height / 2]
                if after:
                    name, word = min(after, key=lambda pair: pair[1]['bbox_pdf_pt'][0])
                    if KANA_START.match(word['raw_text']) and word['bbox_pdf_pt'][0] - x0 <= 3 * height:
                        merged[name['id']] = merged[word['id']] = (f'{kana}{bracket} ', line['bbox_pdf_pt'][0])
                        dropped |= {line['id'], first['id']}
            if again != first['raw_text']:
                changed[first['id']] = (first['raw_text'], again)
                if line['raw_text'].startswith(first['raw_text']):
                    changed[line['id']] = (line['raw_text'], again + line['raw_text'][len(first['raw_text']):])
            if column is None:
                last.append((left, bracket, kana))
            else:
                last[column] = (left, bracket, kana)
        def reread(o: dict) -> dict:
            o = {**o, 'raw_text': changed[o['id']][1]} if o['id'] in changed else o
            if o['id'] in merged:
                kana, left = merged[o['id']]
                o = {**o, 'raw_text': kana + o['raw_text'], 'bbox_pdf_pt': [left, *o['bbox_pdf_pt'][1:]]}
            return o
        regions = [{**region, 'observations': [reread(o) for o in region['observations']
                                               if o['id'] not in dropped and o.get('parent_id') not in dropped]}
                   for region in page['regions']]
        pages.append({**page, 'regions': regions})
    return {**observation, 'pages': pages}
