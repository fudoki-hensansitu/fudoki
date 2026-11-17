"""Document quirk: two neighbouring amount columns print the same figure on most rows (131148 中野区 R6 決算書の歳入:
the 調定額 and the 収入済額, 68pt apart, equal wherever nothing is left uncollected). The observation takes a page where
many words have a twin at one distance on their line for a document that prints a hidden copy of every line, and
drops the copies of one side (`observe.drop_hidden_copies`): here it would drop the 収入済額 of the rows whose two
figures agree. With the quirk, no word is dropped as a copy."""
SCOPE = 'document'
OPTIONS = {'const': True}
