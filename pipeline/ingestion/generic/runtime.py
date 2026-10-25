from pathlib import Path
import re
from ingestion.generic import mixed
from ingestion.generic.layout import normalize
from ingestion.generic.observe import Page, Rule, observe
from ingestion.generic.repair import repair
from ingestion.generic.units import check as check_units
from ingestion.generic.workflow import build_reading, read_layout

DIRECTION_TITLES = {'歳入': 'revenue', '歳出': 'expenditure'}


def page_titles(pages) -> dict[int, str | None]:
    """Each page's direction as printed: the page's own title line (`歳 入`, `歳 出`, above the table), or, for
    a page with none (the right half of a spread, a continued page), the title of the page before it."""
    result, current = {}, None
    for page in sorted(pages, key=lambda p: p.number):
        top = sorted((w for w in page.words if w.y0 < page.height * 0.25), key=lambda w: (w.y0, w.x0))
        rows: list[list] = []
        for word in top:
            if rows and abs(rows[-1][0].y0 - word.y0) <= 2:
                rows[-1].append(word)
            else:
                rows.append([word])
        for row in rows:
            line = normalize(''.join(w.text for w in sorted(row, key=lambda w: w.x0)))
            # `歳入` / `歳出`, or the title of the detail (`(歳入事項別明細書)`).
            title = DIRECTION_TITLES.get(re.sub(r'[()（）]|事項別明細書', '', line))
            if title:
                current = title
                break
        result[page.number] = current
    return result


def image_rules(pdf: Path, page: Page, staircase: bool = False) -> Page:
    """A text page whose ruled grid is a background image (281000): its rules read from the render, as a scan's are."""
    from ingestion.generic.scan import short_rows
    from ingestion.lib import pdf_rules
    detected = short_rows(pdf, pdf_rules.detect(pdf, page.number), staircase=staircase)
    rules = [Rule(r.position, r.start, r.position, r.end) for r in detected.vertical]
    rules += [Rule(r.start, r.position, r.end, r.position) for r in detected.horizontal]
    return Page(page.number, page.width, page.height, page.words, rules)


def run_pages(pdf: Path, pages: list[int], cache: Path | None = None, judge=None,
              document_kind: str = 'settlement', account: str | None = None, stop: bool = True,
              partial: bool = False, direction: str | None = None, layout: dict | None = None,
              columns: dict | None = None, spread: dict | None = None, header: dict | None = None, repairs: frozenset = frozenset(),
              codes_right: bool = False, text_layer: dict | None = None, ocr: tuple | None = None, workflow: dict | None = None):
    """Build one table and keep what the converter needs next to it: the repaired pages (their
    words are the digit-coverage scope), the logical pages (their amount bands) and the unit check.

    A page that is printed as the other direction (a revenue page of a scope that shares its pages with the
    summary, `歳 入` over a 款・項 table) is not read: `report.skipped_pages` lists them.
    Stops when the unit check fails (款 sum ≠ printed total, or a general account's digits);
    `stop=False` returns the check in `report.unit` instead, for a measurement that goes on."""
    staircase = bool((header or {}).get('staircase'))
    # `ocr = (pages, read)`: pages of a text document that OCR read (`mixed.py`), and `read(rule_hook)` for them (their
    # pages, the pinned observation and the variant characters replaced in it). They are
    # not observed from the text layer and not repaired as text, and they teach nothing: the columns the text pages draw
    # complete the rules of their render (the hook) before their words are cut at them.
    numbers, read_ocr = ocr or ((), None)
    character_map = (text_layer or {}).get('character_map')
    printed = observe(pdf, [number for number in pages if number not in numbers], cache, character_map)
    if (text_layer or {}).get('image_rules'):
        printed = [image_rules(pdf, page, staircase) if not page.rules else page for page in printed]
    unrepaired = [Page(page.number, page.width, page.height, list(page.words), page.rules) for page in printed]
    observed, report = repair(pdf, printed, repairs, bool((text_layer or {}).get('form_clips')), character_map)
    read, observation, variants = read_ocr(mixed.completing(mixed.learn_frames(observed, spread, staircase), spread, staircase)) if read_ocr else ([], None, [])
    origins = mixed.learn_origins(observed, spread, staircase)
    shifts = {page.number: mixed.shift(page, origins, spread, staircase) for page in read}
    read = [mixed.moved(page, shifts[page.number]) for page in read]
    # The direction a page prints is read before the repair, which drops what is outside the frame.
    titles = page_titles(sorted([*unrepaired, *read], key=lambda page: page.number)) if direction else {}
    observed = sorted([*observed, *read], key=lambda page: page.number)
    if direction:
        report.skipped_pages = [number for number, title in titles.items() if title not in (None, direction)]
        observed = [page for page in observed if page.number not in report.skipped_pages]
    logicals = read_layout(observed, columns=columns, spread=spread, header=header,
                             split_text='split_at_rules' in repairs, ocr_pages=frozenset(numbers))
    # A staircase declares how the levels are marked: each level's band (see `layout.level_cells`).
    built, choice = build_reading(logicals, document_kind, judge, layout, codes_right, workflow,
                                  staircase=staircase)
    report.pattern = choice
    if observation is not None:
        # The scan's gates over the logical pages OCR read: ink OCR left unread in an amount column, a glyph it could not
        # read in a column the settings declare amounts, and amounts in a column whose kind the text pages do not teach
        # (a heading OCR misread) are listed in `built.unowned`, not left as empty cells.
        from ingestion.generic.scan import declared_unread
        read_logicals = mixed.gated(logicals)
        moved = mixed.moved_unread(observation, shifts)
        declared_unread(built, read_logicals, columns, moved)
        built.unowned.extend(mixed.unlearned_amounts(read_logicals, frozenset(numbers), moved))
        built.notes.extend({'kind': 'variant characters', 'text': text} for text in variants)
    unit = check_units(built, document_kind, account, partial)
    if unit['stopped'] and stop:
        raise ValueError(f'Unit check failed: {unit}')
    report.unit = unit
    return built, report, observed, logicals
