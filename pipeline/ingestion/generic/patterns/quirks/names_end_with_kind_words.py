"""Axis quirk: names end with a kind word (`計`, 132217): a line that starts with a kind word under an item that prints no
amount yet is the wrapped end of its name (`…実施設` / `計 9,900,000`), not an amount kind of it."""
SCOPE = 'axis'
OPTIONS = {'const': True}


def ends_name(previous) -> bool:
    return not previous.amounts
