import json
import subprocess
from ingestion.fiscal.layouts.statement.text_document import build_document
from ingestion.fiscal.manifest import sha_file
from ingestion.lib.node_tables import write_coverage_words
from ingestion.lib.parquet import ParquetColumn, write_parquet
from ingestion.lib.pdf_table import tokens_from_bbox_layout
from ingestion.generic.reading import Reading, declaration_path


class Reader(Reading):
    REQUIRED_RULES = ['assemble', 'controls']

    def __init__(self, profile, workflow):
        super().__init__(profile, workflow)
        self.PROFILE = declaration_path(profile['statement_profile'])
        self.POSITION = tuple(profile['position'])
        self.BUDGET = tuple(profile['budget'])
        self.CONTROL_COLUMNS = tuple(profile['control_columns'])


    def position(self, words):
        if not words or len({w.page for w in words}) != 1:
            raise ValueError('Printed cell must occupy one physical page')
        return dict(zip(self.POSITION, (words[0].page, min(w.bbox.left for w in words),
                                  min(w.bbox.top for w in words), max(w.bbox.right for w in words),
                                  max(w.bbox.bottom for w in words))))

    def convert(self, inputs, destination, options):
        if len(inputs) != 1:
            raise ValueError('This measured layout belongs to Akishima')
        source = inputs[0]
        if source['format'] != 'pdf' or source['pdf_type'] != 'text' or source['direction'] != 'expenditure' or len(source['scope']) != 1:
            raise ValueError('Expected one expenditure text PDF account')
        pages = options['detail_pages']
        ranges = source['scope'][0]['pages']
        if pages not in ranges:
            raise ValueError('Detail pages must be an explicit supplied scope range')
        if sha_file(source['path']) != source['sha256']:
            raise ValueError('Original SHA differs')
        folder = destination / options['table_id']
        folder.mkdir(parents=True, exist_ok=False)

        def extract(first, last, name):
            xml = folder / (name + '.xhtml')
            subprocess.run(['pdftotext', '-f', str(first), '-l', str(last), '-bbox-layout', str(source['path']), str(xml)], check=True)
            return xml.read_bytes()

        profile = json.loads(self.PROFILE.read_text())
        tables, bindings = build_document(extract(*pages, 'detail'), origin_id=source['sha256'], pages=pages, profile=profile)
        first, last = ranges[0]
        if [first, last] == pages:
            raise ValueError('Missing selected subject control pages')
        control_tokens = tokens_from_bbox_layout(extract(first, last, 'controls'), origin_id=source['sha256'], first_page=first)
        rows, metadata, account_total = self.rule('assemble')(tables, bindings, control_tokens)
        path = folder / (options['table_id'] + '.parquet')
        columns = [ParquetColumn(k, 'BIGINT' if k.endswith(('物理頁', '識別頁')) else 'DOUBLE'
                                 if k.endswith(('左端', '上端', '右端', '下端')) else 'VARCHAR') for k in rows[0]]
        write_parquet(path, rows, columns=columns)
        write_coverage_words(path,
                             [(w['page'], tuple(json.loads(w['bbox'])), w['raw_text'])
                              for w in tables['words']] +
                             [(t.page, (t.bbox.left, t.bbox.top, t.bbox.right, t.bbox.bottom), t.raw_text)
                              for t in control_tokens],
                             amount_columns=[{'header': bindings[c['key']]['header_path'][-1],
                                              'x_range': [c['left'], c['right']]}
                                             for c in profile['columns'] if bindings[c['key']]['unit'] is not None] +
                                            [{'header': label, 'x_range': list(edges)}
                                             for label, edges in zip(self.BUDGET, self.CONTROL_COLUMNS)])
        (folder / 'printed-total.json').write_text(json.dumps({'amount_text': account_total, 'unit_text': bindings['current']['unit']}) + '\n')
        return {options['table_id']: {'path': path, 'metadata': metadata}}
