"""Document quirk: `補正経過` under an item's amount opens the history of the year's supplementary budgets
(`第１次補正` / `441,563` / `(第６次補正)` / `(2,032,354)` / `計` / `(3,595,408)`, 131113): each round's amount and the
total after them are notes of the item, never its amounts. The core (`tree.build`) reads the history only when the
workflow selects this quirk."""
SCOPE = 'document'
OPTIONS = {'const': True}
HEADING = '補正経過'


def opens(whole: str) -> bool:
    return whole == HEADING
