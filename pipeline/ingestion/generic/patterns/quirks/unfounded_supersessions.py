"""Document quirk: an ink re-read names in its region's `supersedes` a page reading that none of its own readings lies
over (港区 R6 当初 歳入: the crop took in the 節 amount `319,366` beside the 説明's `(補助率1／4及び3／4)`, the re-read's
line over the amount was left out for one over it, and the region kept only the 説明's line). The page reading is then
replaced by nothing: it stays read. A re-read replaces only what one of its readings lies over."""

SCOPE = 'document'
OPTIONS = {'const': True}


def _over(a, b) -> bool:
    return bool(a and b) and min(a[2], b[2]) > max(a[0], b[0]) and min(a[3], b[3]) > max(a[1], b[1])


def kept(observation_page: dict) -> set[str]:
    """The page readings a region supersedes though none of its readings lies over them, with their words."""
    boxes = {o['id']: o.get('bbox_pdf_pt') for region in observation_page['regions'] for o in region['observations']}
    ids = {i for region in observation_page['regions'] for i in region.get('supersedes', ())
           if boxes.get(i) and not any(_over(o.get('bbox_pdf_pt'), boxes[i]) for o in region['observations']
                                       if not o.get('parent_id'))}
    # (a reading another region supersedes and lies over stays replaced)
    ids -= {i for region in observation_page['regions'] for i in region.get('supersedes', ())
            if any(_over(o.get('bbox_pdf_pt'), boxes.get(i)) for o in region['observations'] if not o.get('parent_id'))}
    return ids | {o['id'] for region in observation_page['regions'] for o in region['observations']
                  if o.get('parent_id') in ids}
