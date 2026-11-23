"""Document quirk: lines of the subject column that print amounts but are no 款・項・目 (宇都宮市 092011 の歳入): a group
of 款 printed over them with their sum (`自主財源` / `依存財源`, 予算の大綱), or a part of the 款 above printed again
under it (`うち臨時財政対策債` under `24 市債`, 決算の計数資料). Read as a subject they would be a level over the 款, or
a 款 of their own that the sum counts twice. Each declared name (the whole printed name, spaces taken out) is read as
a total: its amounts are no item's, it makes no level, and its printed digits are a coverage exclusion of the declared
kind and reason."""
import dataclasses

from ingestion.generic.layout import normalize

SCOPE = 'document'
OPTIONS = {'type': 'array', 'minItems': 1, 'items': {
    'type': 'object', 'additionalProperties': False, 'required': ['name', 'kind', 'reason'],
    'properties': {'name': {'type': 'string', 'minLength': 1}, 'kind': {'type': 'string', 'minLength': 1},
                   'reason': {'type': 'string', 'minLength': 10}}}}


def _key(name: str) -> str:
    return ''.join(normalize(name or '').split())


def declared(value: list[dict], name: str | None) -> dict | None:
    """The declaration of a printed name, if any."""
    return next((line for line in value if _key(line['name']) == _key(name or '')), None)


def split(value: list[dict], items: list) -> list:
    """The subject's items with a declared line taken off the coded item it was read into: with no rule between them
    (R2 決算の計数資料: `24 市債` / `う ち` / `臨時財政対策債` in one cell), the lines under the code read as the
    wrapped tail of its name (`市債うち臨時財政対策債`)."""
    result = []
    for item in items:
        result.append(item)
        if item.code is None or item.amounts or len(item.lines) < 2:
            continue
        for cut in range(1, len(item.lines)):
            tail = item.lines[cut:]
            key = _key(''.join(g.text for line in tail for g in line))
            if declared(value, key) is None or not _key(item.name).endswith(key):
                continue
            head = _key(item.name)[:-len(key)]
            if not head:
                continue
            result[-1] = dataclasses.replace(item, lines=item.lines[:cut], name=head)
            result.append(dataclasses.replace(item, lines=tail, code=None, name=key, indent=tail[0][0].x0))
            break
    return result
