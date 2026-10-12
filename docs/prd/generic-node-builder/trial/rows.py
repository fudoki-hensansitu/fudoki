"""Row identities of a built table, for comparing two builds row by row.

A node row is (axis, path, page); an amount row adds (header, amount, unit). The path is the
(axis, code, name) of every node from the root, so a node that moves to another parent, page
or amount counts as one row gone and one row added.
"""
from collections import Counter


def identities(nodes: list[dict], amounts: list[dict]) -> Counter:
    by_key = {n['node_key']: n for n in nodes}

    def path(key: str) -> tuple:
        chain, seen = [], set()
        while key in by_key and key not in seen:
            seen.add(key)
            node = by_key[key]
            chain.append((node['axis_header'], node.get('code_text'), node.get('name_text')))
            key = node['parent_node_key']
        return tuple(reversed(chain))

    rows = Counter(('node', path(n['node_key']), n.get('physical_page')) for n in nodes)
    rows.update(('amount', path(a['node_key']), a.get('header_path'), a.get('amount_text'), a.get('unit_text'))
                for a in amounts)
    return rows


def as_json(rows: Counter) -> list:
    return [[list(map(lambda x: list(x) if isinstance(x, tuple) else x, key)), count] for key, count in sorted(rows.items(), key=str)]


def from_json(data: list) -> Counter:
    freeze = lambda v: tuple(freeze(x) for x in v) if isinstance(v, list) else v
    return Counter({freeze(key): count for key, count in data})


def changes(before: Counter, after: Counter, examples: int = 5) -> dict:
    gone, added = before - after, after - before
    show = lambda c: [str(k)[:240] for k in list(c.elements())[:examples]]
    return {'gone': sum(gone.values()), 'added': sum(added.values()), 'gone_examples': show(gone), 'added_examples': show(added)}
