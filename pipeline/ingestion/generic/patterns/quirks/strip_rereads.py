"""Document quirk: OCR read the page in vertical strips that overlap widely (`strip_overlap_px: 400`, 132233 R5 当初),
and a line in the band two strips share is read by both. The OCR drops the second reading only when the two read
the same text or one is cut inside the other; a reading cut by its strip's edge reads other characters there
(`職員採用案内作成委計` for `…委託料`), and a variant character (`涉外経費` / `渉外経費`) differs too. Both stay, and
the builder joins them into one line read twice (`66 渉外経費渉外経費`). Of two readings of adjacent strips whose
boxes overlap by half the smaller one and that share most of the shorter one's characters, the one farther from its own strip's edge is the line; the other goes, with
its words."""
import re

SCOPE = 'document'
OPTIONS = {'const': True}
SHARED = .5
ALIKE = .5  # share of the shorter reading's characters the longer one holds
STRIP = re.compile(r':result(\d+):')


def _overlap(a, b) -> float:
    width = min(a[2], b[2]) - max(a[0], b[0])
    height = min(a[3], b[3]) - max(a[1], b[1])
    smaller = min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]))
    return width * height / smaller if width > 0 and height > 0 and smaller > 0 else 0.0


def _alike(a: str, b: str) -> bool:
    """Two readings of one line share most of the shorter one's characters (a cut or a variant reads a few others)."""
    short, long = sorted((''.join(a.split()), ''.join(b.split())), key=len)
    return bool(short) and sum(1 for c in short if c in long) >= ALIKE * len(short)


def rereads(observation_page: dict, gone: set[str]) -> set[str]:
    spans = {a['id']: a.get('strips_px') for a in observation_page.get('attempts', ())}
    readings = []
    for region in observation_page['regions']:
        for o in region['observations']:
            found = STRIP.search(o['id'])
            strips = spans.get(o.get('attempt_id'))
            if o['kind'] == 'region' and o['id'] not in gone and o.get('bbox_px') and found and strips:
                k = int(found.group(1))
                if k < len(strips):
                    middle = (o['bbox_px'][0] + o['bbox_px'][2]) / 2
                    readings.append((o, o['attempt_id'], k, min(middle - strips[k][0], strips[k][1] - middle)))
    dropped = set()
    for a, attempt, k, margin_a in readings:
        for b, other, j, margin_b in readings:
            if other != attempt or j != k + 1 or a['id'] in dropped or b['id'] in dropped:
                continue
            if _overlap(a['bbox_px'], b['bbox_px']) >= SHARED and _alike(a['raw_text'], b['raw_text']):
                dropped.add(b['id'] if margin_a >= margin_b else a['id'])
    observations = [o for region in observation_page['regions'] for o in region['observations']]
    return dropped | {o['id'] for o in observations if o.get('parent_id') in dropped}
