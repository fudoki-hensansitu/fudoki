from ingestion.generic.layout import SUBJECT_LEVELS
from ingestion.generic.tree import code_columns, subject_header


def select(bands):
    subject_bands, _, count = code_columns(bands)
    if subject_bands:
        following = bands.index(subject_bands[-1]) + 1
        if following < len(bands) and bands[following].kind == 'label' and not (
                bands[following].header and bands[following].header[-1] in SUBJECT_LEVELS) and (
                not bands[following].header or subject_header(bands[following].header)):
            subject_bands.append(bands[following])
        else:
            subject_bands = []
    return subject_bands, "names", count
