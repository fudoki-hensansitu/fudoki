"""分割した候補を未読のまま捨てたり、回答したりできないことをCLIから検査する。"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

TOOL = Path(__file__).with_name('agent_tool.py')


class CandidateReadingTest(unittest.TestCase):
    def test_read_all_slices_before_answering_or_searching_again(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            (work / 'agent').mkdir()
            (work / 'bin').mkdir()
            (work / 'agent/questions.json').write_text(json.dumps({'q': {'jurisdiction': '131172'}}))
            index = {f'c{n}': {'item': 'pdf', 'start': n, 'sha': 'sha', 'offset': 0, 'doc': '資料',
                              'lead': None, 'pages': [f'sha:{n}'], 'text': f'### Page {n}\n' + '候補の本文' * 1000}
                     for n in (1, 2)}
            (work / 'agent/chunk_index.json').write_text(json.dumps(index, ensure_ascii=False))
            cf = work / 'bin/cf'
            cf.write_text(f'#!{sys.executable}\n' + '''import json, os
from pathlib import Path
index = json.loads((Path(os.environ['AGENT_WORK']) / 'agent/chunk_index.json').read_text())
print(json.dumps({'chunks': [{'id': cid, 'text': value['text'], 'item': {'metadata': {}}}
                              for cid, value in index.items()]}))
''')
            cf.chmod(0o755)
            env = dict(os.environ, AGENT_WORK=str(work), AGENT_QID='q', PATH=str(work / 'bin') + os.pathsep + os.environ['PATH'])

            def call(*args):
                return subprocess.run([sys.executable, str(TOOL), *args], env=env, capture_output=True, text=True, timeout=30)

            answer = json.dumps({'status': 'found', 'pages': ['sha:1'], 'projects': []})
            first = call('search', '事業名')
            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertEqual(len(json.loads((work / 'agent/q.pending.json').read_text())), 1)
            self.assertNotEqual(call('answer', answer).returncode, 0)
            blocked = call('search', '別の検索語')
            self.assertNotEqual(blocked.returncode, 0)
            self.assertIn('未読', blocked.stderr)
            self.assertEqual(len((work / 'agent/q.jsonl').read_text().splitlines()), 1)
            self.assertEqual(call('more').returncode, 0)
            self.assertEqual(call('search', '別の検索語').returncode, 0)
            self.assertEqual(call('answer', answer).returncode, 0)
            rows = [json.loads(line) for line in (work / 'agent/q.jsonl').read_text().splitlines()]
            self.assertEqual([row['kind'] for row in rows], ['search', 'more', 'search', 'answer'])


if __name__ == '__main__':
    unittest.main()
