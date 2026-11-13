"""Document quirk: the text layer sets the minus sign of an amount as the Greek capital delta `Δ` (U+0394) or the
increment sign `∆` (U+2206), not `△` (北区 R6 予算説明書の比較の欄: `Δ234`, `Δ2,441,` `853`). The amount readers know
only `△`/`▲`, so the figure would not read as an amount and its digits would not join across the glyphs the font
draws them in. A delta that starts a number, or stands alone in front of one, is read as `△`, before the touching
digit groups are joined (`repair.repair_positions`)."""
import re

from ingestion.generic.observe import Page, Word

SCOPE = 'document'
OPTIONS = {'const': True}

DELTAS = 'Δ∆'
DELTA = re.compile(f'[{DELTAS}](?=[0-9,]|$)')


def replace(page: Page) -> None:
    page.words = [Word(DELTA.sub('△', word.text), word.x0, word.y0, word.x1, word.y1)
                  if any(c in word.text for c in DELTAS) else word for word in page.words]
