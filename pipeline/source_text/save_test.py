import json
import tempfile
import unittest
from pathlib import Path

from source_text.save import load_origins, project_origins


def selection(kind_field: str, sha: str) -> dict:
    return {kind_field: [{
        'target': {'jurisdiction': '131091', 'fiscal_year': 2026, 'document_kind': 'budget'},
        'selected_candidate_id': 'c1',
        'candidates': [{'id': 'c1', 'files': [{'sha256': sha, 'format': 'pdf', 'pdf_type': 'text'}]}],
        'archive': {'files': [{'sha256': sha, 'key': f'fiscal/{sha}.pdf'}]},
    }]}


class LoadOriginsTest(unittest.TestCase):
    def test_press_selections_are_press_and_project_origins_read_only_results(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / '131091.json').write_text(json.dumps(selection('press_selections', 'a' * 64)), encoding='utf-8')
            declared = root / 'origins.json'
            declared.write_text(json.dumps({'press': [{'jurisdiction': '131091', 'layout': 'shinagawa_press'}],
                                            'results': []}), encoding='utf-8')
            self.assertEqual(project_origins(declared), [])
            press = [o for o in load_origins(root) if o.sha256 == 'a' * 64]
            self.assertEqual([(o.kind, o.r2_key) for o in press], [('press', f'fiscal/{"a" * 64}.pdf')])


if __name__ == '__main__':
    unittest.main()
