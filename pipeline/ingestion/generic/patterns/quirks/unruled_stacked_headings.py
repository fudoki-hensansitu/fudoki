"""Document quirk: a heading printed over several columns has no rule under it that the page's detector keeps (131113
R5 決算: `翌年度繰越額` over 継続費逓次繰越・繰越明許費・事故繰越, `節` over 区分・金額, on an A3 spread whose short
header rules are shorter than a fifth of its width). The heading's cell and the cell of the column under it then
start at the same rule, and which of the two comes first in the column's header path is left to the order the words
were read (`継続費逓次繰越／翌年度繰越額` on some pages). With this quirk cells starting at the same rule stack in
the order their words are printed, top first."""

SCOPE = 'document'
OPTIONS = {'const': True}
