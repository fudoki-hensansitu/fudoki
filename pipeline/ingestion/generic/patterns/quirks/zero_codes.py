"""Document quirk (with `zero_coded_drops`): a subject the year drops keeps its row and is numbered 0 (132195 R6 国保: `（項） ０．傷病手当金` and
its 目 `０. 傷病手当金 0 644 △644`). The leading `０.` is the subject's number, not a bullet drawn as a digit, so the
number stays the code."""
SCOPE = 'document'
OPTIONS = {'const': True}
