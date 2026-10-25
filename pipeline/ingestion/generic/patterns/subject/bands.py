from ingestion.generic.layout import SUBJECT_LEVELS


def select(bands):
    subject_bands = []
    for index, band in enumerate(bands):
        if band.kind == 'label' and band.header and band.header[-1] in SUBJECT_LEVELS:
            if subject_bands and subject_bands[-1] is not bands[index - 1]:
                break
            subject_bands.append(band)
    count = len(subject_bands)
    return subject_bands, "bands", count
