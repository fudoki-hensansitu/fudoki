"""Axis quirk: a subject the year drops (numbered 0, the quirk `zero_codes`) prints a bare item number in the axis's
column on its row, with no name and no amount (狛江市の予算事項別明細書 R7 介護保険特別会計の歳入 p57: `０. 介護保険事業費
補助金 0 1,600 △1,600` with `１.` alone under 節／区分). The number is what is left of the item the year no longer
budgets, not an item without a name: it is read as no item (a coverage exclusion)."""
SCOPE = 'axis'
OPTIONS = {'const': True}
