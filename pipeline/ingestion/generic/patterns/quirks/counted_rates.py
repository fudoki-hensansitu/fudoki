"""Document quirk: a rate under an item counts from 1 (`1件につき 46円40銭 1,247,693件`, `1月につき 18,333円 12月`,
新宿区の予算事項別明細書): the number before the counter is part of the line, not item `1`, where it does not follow
the item before it."""
import re

SCOPE = 'document'
OPTIONS = {'const': True}


def counted(first_word: str, raw: str) -> bool:
    return re.match(r'[0-9]+(?:件|月|人|回|日|台|か所|箇所)(?:に?つき|当たり|あたり)', raw) is not None
