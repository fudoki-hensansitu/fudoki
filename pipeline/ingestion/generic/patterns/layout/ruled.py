from ingestion.generic import layout


def read(pages, **options):
    return layout.logical_pages(pages, **options)
