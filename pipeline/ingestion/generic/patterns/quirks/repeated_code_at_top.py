"""Axis quirk: a continuation page prints the code of the open item of the axis again at its top, with no name and no
amount (狛江市の予算事項別明細書の歳入: `２.` under 目 and `１.` under 節 over the 説明 of the 現年課税分 the page goes
on with). Where no subject opens on the page before it, a bare code equal to the code of an open item of the axis
is that item, not a new item without a name."""
SCOPE = 'axis'
OPTIONS = {'const': True}
