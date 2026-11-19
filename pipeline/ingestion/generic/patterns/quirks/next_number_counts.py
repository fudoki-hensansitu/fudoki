"""Document quirk: a number glued to a counter that is the number after the item before it is that item's number
(`16 …交付金` / `17年金生活者支援給付金支給業務市町村事務取扱交付金`, 131181), not a count `17年` of the name. A 1 glued
to a counter opens a list (`1歳計現金等利子`, 131237): it is the list's first number, not a count `1歳`."""

SCOPE = 'document'
OPTIONS = {'const': True}
