"""Document quirk: OCR reads pieces of the faint column rules as a short run of digits or dashes, read again from the
ink it left (羽村市 R5 決算: about 600 `1`, `2`, `4`, `--`, `-1`, `4e`, `=,` on the rules of the amount columns, some in the
header under its labels). A reading of one or two characters starting with a digit other than 0, a dash or a stroke
(`=`, `,`) is the rule's piece when it lies on a column rule: a printed figure sits between the rules. A re-read of a digit-sized mark (a reading
with no words) is boxed tight on its ink and touches the rule; a line read with its words is boxed with padding (a code
`1` set right in its column reaches the rule with it), so it runs across the rule by more than the padding. The word
boxes are not compared: the OCR estimates them inside the line and puts them off the ink. The reading is dropped before
the page is laid out, so it neither opens the body under a header nor lands in an amount column; the ink it covered is a
rule's piece (`rule_ink`)."""

SCOPE = 'document'
OPTIONS = {'const': True}
MARGIN = .5  # pt: a rule is drawn with width; its detected position is its middle
MARKS = set('123456789１２３４５６７８９-－ー一=＝|lI,，')


def pieces(observation_page: dict, cuts: list[float]) -> set[str]:
    observations = [o for region in observation_page['regions'] for o in region['observations']]
    worded = {o['parent_id'] for o in observations if o['kind'] == 'word' and o.get('parent_id')}
    found = set()
    for o in observations:
        text, box = o['raw_text'].strip(), o.get('bbox_pdf_pt')
        if o['kind'] != 'region' or not box or not 0 < len(text) <= 2 or text[0] not in MARKS:
            continue
        on_rule = (lambda x: box[0] + MARGIN < x < box[2] - MARGIN) if o['id'] in worded \
            else (lambda x: box[0] - MARGIN <= x <= box[2] + MARGIN)
        if any(on_rule(x) for x in cuts):
            found.add(o['id'])
    # The words under a dropped reading go with it.
    return found | {o['id'] for o in observations if o.get('parent_id') in found}
