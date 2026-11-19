"""Document quirk: a subject the year drops prints `△` between its code and its name, and the code moves left by the
mark's width so the name keeps its level's column (132080 当初予算 R7 国保, scan: 目「10△退職被保険者等医療給付費分」
starts at x 75, the 目「5」 at 79, the 項「5」 at 70). Read where the code starts, such a 目 lies between the 項 and the 目
and joins their starts into one level. The item is read the value (pt) further right, where its code would start without
the mark. Read by the subject pattern `indent`."""
import re

SCOPE = 'document'
OPTIONS = {'type': 'number', 'exclusiveMinimum': 0}

MARKED = re.compile(r'^[0-9]{1,4}\s*[△▲]')


def align(item, shift: float) -> None:
    lead = min(item.glyphs, key=lambda g: g.x0) if item.glyphs else None
    if item.code is not None and lead is not None and MARKED.match(lead.text):
        item.indent += shift
