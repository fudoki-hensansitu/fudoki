"""Document quirk: a 款・項・目 row prints its amount again in a breakdown axis's column on its own row, where that
axis prints no name (132284's 予備費: `01 予備費 30,000 …` with `30,000` under 節／金額 and 区分 blank). Equal, to the
yen, to an amount the row prints in a column of its own, it is the row's amount again, not a new one. Only a row with
no item of that axis under it; an amount that differs stays (the tree check stops). Recorded as `親の繰り返し`."""
from collections import defaultdict

SCOPE = 'document'
OPTIONS = {'const': True}


def take(nodes: list[dict], amounts: list[dict]) -> list:
    """Remove those amounts from `amounts` and return their glyphs."""
    from ingestion.generic.tree import Glyph, normalize
    breakdown = {n['axis_header'] for n in nodes if n['axis_header'] != '科目'}
    if not breakdown:
        return []
    subject = {n['node_key'] for n in nodes if n['axis_header'] == '科目'}
    parents = {(n['parent_node_key'], n['axis_header']) for n in nodes if n['axis_header'] != '科目'}
    by_node: dict[str, list[dict]] = defaultdict(list)
    for amount in amounts:
        if amount['node_key'] in subject:
            by_node[amount['node_key']].append(amount)
    repeated = []
    for key, own in by_node.items():
        columns = [a for a in own if a['header_path'].split('／')[0] not in breakdown]
        for amount in list(own):
            axis = amount['header_path'].split('／')[0]
            if axis not in breakdown or (key, axis) in parents or amount['x0'] is None:
                continue
            if not any(normalize(a['amount_text']) == normalize(amount['amount_text']) for a in columns):
                continue
            amounts.remove(amount)
            repeated.append(Glyph(amount['amount_text'], amount['x0'], amount['y0'], amount['x1'], amount['y1'],
                                  amount['physical_page'], 0.0))
    return repeated
