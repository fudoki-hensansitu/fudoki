from __future__ import annotations
import ctypes
from pathlib import Path
from ingestion.generic.observe import OPENING, Page, Word


def opening_brackets(pdf_path: Path, pages: list[Page]) -> None:
    """Poppler boxes a full-width opening bracket by its ink, which sits in the right of its cell (`（仮称）` starts
    7pt right of the name it is lined up with): a word that begins with one starts where its character's cell does."""
    from ingestion.generic.repair import _glyphs
    import pypdfium2 as pdfium
    pdf = pdfium.PdfDocument(str(pdf_path))
    try:
        for page in pages:
            if not any(word.text[:1] in OPENING for word in page.words):
                continue
            glyphs, _ = _glyphs(pdf, page.number, True)
            for index, word in enumerate(page.words):
                if word.text[:1] not in OPENING:
                    continue
                cell = [box for box, char, _ in glyphs if char == word.text[0] and word.x0 - 12 < box[0] < word.x0 - 1
                        and box[2] > word.x0 - .5 and abs((box[1] + box[3]) / 2 - (word.y0 + word.y1) / 2) < 2]
                if cell:
                    page.words[index] = Word(word.text, min(cell, key=lambda box: word.x0 - box[0])[0], word.y0, word.x1, word.y1)
    finally:
        pdf.close()


def left_edge(raw, textpage, index, left):
    x, y = ctypes.c_double(), ctypes.c_double()
    return x if raw.FPDFText_GetCharOrigin(textpage.raw, index, x, y) and x.value < left.value else left
