"""Document quirk: a PDF whose words OCR reads from the render because its text layer maps no glyph to its character
(a broken ToUnicode, 132233 R5 当初の事項別明細書), but whose rules are drawn as vector lines. The page's rules come
from the PDF's own drawing (`observe`), not from the render (`scan.pages`). The render's detector keeps long strokes
only and a short row rule only between two neighbouring column rules, so the header's short cells are lost (the 科目
cell over 款・項・目, 18–127 at 68pt, and the 款・項 rules under it, 68–107) and the subject columns read as one.

Strokes shorter than `SHORTEST` are not rules (the PDF draws a few short strokes in the header's letters)."""
from pathlib import Path

from ingestion.lib import pdf_rules

SCOPE = 'document'
OPTIONS = {'const': True}

SHORTEST = 15.0  # points
THICKNESS = .5


def detected(pdf: Path, number: int) -> pdf_rules.PageRules:
    """The page's vector rules, as the render's detector gives rules."""
    from ingestion.generic.observe import observe
    page = observe(pdf, [number])[0]
    vertical = sorted((pdf_rules.Rule(r.x0, r.y0, r.y1, THICKNESS) for r in page.rules
                       if r.vertical and r.y1 - r.y0 >= SHORTEST), key=lambda r: (r.position, r.start))
    horizontal = sorted((pdf_rules.Rule(r.y0, r.x0, r.x1, THICKNESS) for r in page.rules
                         if not r.vertical and r.x1 - r.x0 >= SHORTEST), key=lambda r: (r.position, r.start))
    return pdf_rules.PageRules(number, round(page.width, 1), round(page.height, 1), tuple(vertical), tuple(horizontal))
