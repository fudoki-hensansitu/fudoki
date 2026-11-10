"""A settlement summary page printing the 歳入, 目的別 and 性質別 tables of one account stacked (三宅村, 133817).

The page's first title is `◎ 歳 入`, so the generic builder takes the whole page for the revenue direction and skips
it (`runtime.page_titles`). The 目的別 table under it is the expenditure of the account by 款. The profile's layered
workflow reads it: its layout pattern `purpose_section` keeps only that table. The page carries both directions, so
no page is skipped for the title it prints first; the rest is the generic builder's, unchanged.
"""
from ingestion.generic.convert import convert as generic_convert
from ingestion.generic.reading import Reading
from ingestion.generic.workflow import selections, validate as validate_layered

# The pattern modules the profile's layered workflow may select. The generic builder loads them by name, so the
# fingerprint (`manifest.dependencies`, which follows `ingestion.` names in the code) sees them only here: a profile
# that selects any other pattern is refused rather than read with code the fingerprint does not cover.
LAYERED_MODULES = (
    'ingestion.generic.patterns.layout.purpose_section',
    'ingestion.generic.patterns.headers.standard',
    'ingestion.generic.patterns.subject.indent',
)


class Reader(Reading):
    REQUIRED_RULES = ()

    def __init__(self, profile, workflow):
        super().__init__(profile, workflow)
        self.layered = validate_layered(profile['workflow'], text_pdf=True, coupled=False)
        if self.layered['layout']['pattern'] != 'purpose_section':
            raise ValueError('The summary reading reads the 目的別 section: its layout pattern is purpose_section')
        untracked = set(selections(self.layered).values()) - set(LAYERED_MODULES)
        if untracked:
            raise ValueError(f'The profile selects patterns outside LAYERED_MODULES: {sorted(untracked)}')

    def convert(self, inputs, destination, options):
        if len(inputs) != 1 or inputs[0].get('direction') != 'expenditure':
            raise ValueError('The summary reading converts one original for the expenditure direction')
        source = {**inputs[0], "direction": None}
        return generic_convert([source], destination, {**options, 'workflow': self.layered})
