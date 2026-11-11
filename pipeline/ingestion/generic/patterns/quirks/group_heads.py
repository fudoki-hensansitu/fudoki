"""Axis quirk: where a heading is printed at the start of the items it heads (国分寺市 `塵芥処理に要する経費` over
`0140950 可燃ごみ共同処理事業関係経費` …): `build` hangs the items after it at its level from it, until they add up to
its amount."""
SCOPE = 'axis'
OPTIONS = {'type': 'array', 'items': {
    'type': 'object', 'additionalProperties': False, 'required': ['page', 'y', 'reason'],
    'properties': {'page': {'type': 'integer', 'minimum': 1}, 'y': {'type': 'number'},
                   'reason': {'type': 'string', 'minLength': 10}}}}


def mark(items: list, value: list[dict]) -> None:
    for head in value:
        for item in items:
            first = item.lines[0][0] if item.lines and item.lines[0] else None
            if first is not None and first.page == head['page'] and abs(first.y0 - head['y']) < 3:
                item.sums = True
