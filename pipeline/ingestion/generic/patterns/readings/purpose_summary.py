"""A settlement summary page printing the 歳入, 目的別 and 性質別 tables of one account stacked (三宅村, 133817).

The page's first title is `◎ 歳 入`, so the generic builder takes the whole page for the revenue direction and skips
it (`runtime.page_titles`). The 目的別 table under it is the expenditure of the account by 款. The profile's layered
workflow reads it: its layout pattern `purpose_section` keeps only that table. The page carries both directions, so
no page is skipped for the title it prints first; the rest is the generic builder's, unchanged. For the revenue
direction the layout pattern `revenue_section` keeps the 歳入 table instead.
"""
from ingestion.generic.convert import convert as generic_convert
from ingestion.generic.reading import Reading
from ingestion.generic.workflow import selections, validate as validate_layered

# The pattern modules the profile's layered workflow may select. The reading is written for the 目的別 table that
# `purpose_section` keeps and the 歳入 table `revenue_section` keeps, so a profile that selects any other is refused.
LAYERED_MODULES = (
    'ingestion.generic.patterns.layout.purpose_section',
    'ingestion.generic.patterns.layout.revenue_section',
    'ingestion.generic.patterns.headers.standard',
    'ingestion.generic.patterns.subject.indent',
)

SECTIONS = {'expenditure': 'purpose_section', 'revenue': 'revenue_section'}


class Reader(Reading):
    REQUIRED_RULES = ()

    def __init__(self, profile, workflow):
        super().__init__(profile, workflow)
        self.layered = validate_layered(profile['workflow'], text_pdf=True, coupled=False)
        if self.layered['layout']['pattern'] not in SECTIONS.values():
            raise ValueError('The summary reading reads one section: its layout pattern is purpose_section or revenue_section')
        untracked = set(selections(self.layered).values()) - set(LAYERED_MODULES)
        if untracked:
            raise ValueError(f'The profile selects patterns outside LAYERED_MODULES: {sorted(untracked)}')

    def convert(self, inputs, destination, options):
        if len(inputs) != 1 or SECTIONS.get(inputs[0].get('direction')) != self.layered['layout']['pattern']:
            raise ValueError('The summary reading converts one original, the section of its direction '
                             '(purpose_section for expenditure, revenue_section for revenue)')
        source = {**inputs[0], "direction": None}
        return generic_convert([source], destination, {**options, 'workflow': self.layered})
