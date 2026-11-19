"""Document quirk: the text layer sets an item's number a little less than 2pt before its name, as a word of its own
(`23` `年金生活者支援給付金…`, `1` `歳計現金等預金利子`: 1.7pt apart, 131156 杉並区 R6 当初予算の歳入). A name that begins with
a count word (`年`, `歳`) is otherwise read as a count (`3歳児健康診査`): a number that is a word of its own at least this
far from the name is the item's number."""
SCOPE = 'document'
OPTIONS = {'const': True}
GAP = 1.5  # points
