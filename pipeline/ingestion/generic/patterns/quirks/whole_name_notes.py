"""Axis quirk: a note line whose whole name is a word that also begins an item's name (132292's 民生費: the 積算
`事務費 21,956,352円` under `養護老人ホーム等措置費`, and the 事業 `事務費繰出金`). `note_kinds` matches the start of a
line, so it cannot name the one without the other: a line whose name (its amounts left out) is one of these words is
a note of the kind the word maps to."""
SCOPE = 'axis'
OPTIONS = {'type': 'object', 'minProperties': 1, 'additionalProperties': {'type': 'string', 'minLength': 1}}
