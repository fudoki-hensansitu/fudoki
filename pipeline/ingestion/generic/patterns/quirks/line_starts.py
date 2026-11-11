"""Axis quirk: where a line starts on the page, for a line OCR boxed a few points left of its print (132021)."""
SCOPE = 'axis'
OPTIONS = {'type': 'array', 'minItems': 1, 'items': {
    'type': 'object', 'additionalProperties': False, 'required': ['page', 'y', 'shift', 'reason'],
    'properties': {'page': {'type': 'integer', 'minimum': 1}, 'y': {'type': 'number'}, 'shift': {'type': 'number'},
                   'reason': {'type': 'string', 'minLength': 10}}}}


def shift(items: list, value: list[dict]) -> None:
    for repair in value:
        for item in items:
            first = item.lines[0][0] if item.lines and item.lines[0] else None
            if first is not None and first.page == repair['page'] and abs(first.y0 - repair['y']) < 3:
                first.x0 += float(repair['shift'])
                item.indent += float(repair['shift'])
