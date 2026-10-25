from ingestion.generic.tree import DETAIL_PATTERNS, SUBJECT_PATTERNS, Built, build
from ingestion.generic.units import resolve as resolve_units
from ingestion.generic.headers import dictionary_header
from ingestion.lib.tree_checks import check_tree


def closure(built: Built, document_kind: str) -> dict:
    """How well a tree closes: the selection criterion, kept in one place.

    The subject pattern decides the 款・項・目 levels, so the score is the
    subject axis's own closure: parent/child groups on the subject axis whose
    sums agree, minus twice those that disagree. Ties go to named subject nodes
    minus unnamed ones, then to the whole tree's closure (a pattern that splits
    a code from the name printed below it makes a nameless node per code, 134015).
    A pattern that finds no subject column gets no score. (Scoring the whole tree
    let a pattern that found 7 of 25 subject nodes win on the breakdown axes
    alone, 131148.)
    """
    result = check(built, document_kind)
    subject_results = [r for r in result['results'] if r['axis_header'] == '科目']
    agree = sum(1 for r in subject_results if r['status'] == '一致')
    disagree = len(subject_results) - agree
    total_agree, total_disagree = result['counts'].get('一致', 0), result['counts'].get('不一致', 0)
    subject = sum(1 for n in built.nodes if n['axis_header'] == '科目')
    named = sum(1 for n in built.nodes if n['axis_header'] == '科目' and n['name_text'])
    return {'subject_agree': agree, 'subject_disagree': disagree, 'agree': total_agree, 'disagree': total_disagree,
            'issues': len(result['issues']), 'subject_nodes': subject, 'named_subject_nodes': named,
            'score': (agree - 2 * disagree, named - (subject - named), total_agree - 2 * total_disagree)}


def choose_pattern(logicals, document_kind: str = 'settlement', judge=None, layout: dict | None = None,
                   codes_right: bool = False, patterns: tuple[str, ...] = SUBJECT_PATTERNS) -> tuple[Built, dict]:
    """Decide the unit, build the tree with every subject pattern and keep the one that closes best."""
    unit_sources = resolve_units(logicals, document_kind)
    trials = {}
    for pattern in patterns:
        built = build(logicals, judge, pattern, layout=layout, codes_right=codes_right)
        trials[pattern] = (built, closure(built, document_kind))
    # A pattern that finds no subject column is not a reading of this document.
    eligible = [p for p in trials if trials[p][1]['subject_nodes']] or list(trials)
    best = max(eligible, key=lambda p: (*trials[p][1]['score'], -SUBJECT_PATTERNS.index(p)))
    # Breakdown levels per axis: indentation or numbering shapes, whichever closes a larger
    # share of that axis's parent/child groups. A share, not a count: flattening an axis
    # removes comparisons and would win a count (杉並の備考: 6,670 items on one level).
    per_axis = {}
    for detail in DETAIL_PATTERNS:
        built = trials[best][0] if detail == 'indent' else build(logicals, judge, best, detail, layout, codes_right)
        for result in check(built, document_kind)['results']:
            if result['axis_header'] != '科目':
                counts = per_axis.setdefault(result['axis_header'], {d: [0, 0] for d in DETAIL_PATTERNS})
                counts[detail][0 if result['status'] == '一致' else 1] += 1
    share = lambda c: (c[0] / (c[0] + c[1]) if c[0] + c[1] else 0, c[0])
    chosen = {axis: max(DETAIL_PATTERNS, key=lambda d: (*share(counts[d]), -DETAIL_PATTERNS.index(d)))
              for axis, counts in per_axis.items()}
    built = trials[best][0] if all(d == 'indent' for d in chosen.values()) else build(logicals, judge, best, chosen, layout, codes_right)
    return built, {'chosen': best, 'detail': chosen, 'detail_scores': per_axis, 'units': unit_sources,
                   'trials': {p: c for p, (_, c) in trials.items()}}


def check(built: Built, document_kind: str = 'settlement') -> dict:
    amounts = [{**a, 'header_path': dictionary_header(a['header_path'], document_kind)} for a in built.amounts]
    return check_tree(built.nodes, amounts, document_kind)
