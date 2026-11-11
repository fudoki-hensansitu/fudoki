"""Document quirk: a skewed scan reads a column's heading with its cells cut elsewhere (`本年度の` / `財源内訳` for
`本年度の財源内訳`), only in part, or with its characters out of order (`国都支出金` under `本年度の財源内訳／特定財源`,
`度)較)`; 132144). The declared column whose heading reads the same characters, or else the declared columns whose
heading holds every character read when they all declare the same, is the column's setting."""
from collections import Counter

SCOPE = 'document'
OPTIONS = {'const': True}


def declared(header: tuple, columns: dict) -> dict | None:
    joined = ''.join(header)
    setting = next((v for k, v in columns.items() if joined and k.replace('／', '') == joined), None)
    if setting is None and header:
        read = Counter(joined)
        found = [v for k, v in columns.items() if not read - Counter(k.replace('／', ''))]
        setting = found[0] if found and all(v == found[0] for v in found) else None
    return setting
