"""Document quirk: a word boxed less than half as tall as the page's usual word, and no dash or sign, is a speck of the
scan OCR read as a character (132144: `4` 1pt tall left of `300`, `电` over an amount)."""
from dataclasses import replace

SCOPE = 'document'
OPTIONS = {'const': True}


def drop(printed: list) -> list:
    from ingestion.generic.layout import SIGNS
    from ingestion.generic.scan import DASHES
    result = []
    for page in printed:
        heights = sorted(w.y1 - w.y0 for w in page.words)
        usual = heights[len(heights) // 2] if heights else 0
        kept = [w for w in page.words if w.y1 - w.y0 >= usual / 2 or w.text.strip() in DASHES or w.text.strip() in SIGNS
                or w.text.strip() in ('・', '.', ',', '，')]
        result.append(replace(page, words=kept) if len(kept) != len(page.words) else page)
    return result
