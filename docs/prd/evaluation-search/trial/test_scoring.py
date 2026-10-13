"""採点・引用判定の境界を確認する。外部サービスには接続しない。"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent


class ScoringTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)
        for name in ('trial', 'agent', 'judge/pages', 'judge/quotes', 'bin'):
            (self.work / name).mkdir(parents=True)
        self.q = {'id': 'q', 'set': 'S1', 'truth': ['sha:1'], 'accept': ['sha:1'],
                  'target': {'jurisdiction_name': '区', 'name': '事業', 'kind': '事業'}}
        self.answer = {'status': 'found', 'pages': ['sha:1'], 'projects': [
            {'fields': {'実績': {'page': 'sha:1', 'quote': '実績1', 'reading': '今年度'}}}]}
        self.log = [{'kind': 'search', 'chunks': ['seen']}, {'kind': 'answer', 'answer': self.answer}]
        self.index = {
            'seen': {'item': 'pdf', 'start': 0, 'sha': 'sha', 'offset': 0, 'lead': None, 'text': '### Page 1\n実績1'},
            'unseen': {'item': 'pdf', 'start': 1, 'sha': 'sha', 'offset': 0, 'lead': None, 'text': '### Page 1\n実績2'},
        }

    def write(self, name, data):
        (self.work / name).write_text(json.dumps(data, ensure_ascii=False))

    def prepare(self):
        self.write('trial/questions2.json', [self.q])
        self.write('agent/chunk_index.json', self.index)
        (self.work / 'agent/q.jsonl').write_text(''.join(json.dumps(row, ensure_ascii=False) + '\n' for row in self.log))

    def run_script(self, script, *args):
        self.prepare()
        return subprocess.run([sys.executable, str(HERE / script), *args], capture_output=True, text=True,
                              env=dict(os.environ, PATH=str(self.work / 'bin') + os.pathsep + os.environ['PATH']))

    def fake_judge(self):
        for name, body in {
            'claude': "import json\nprint(json.dumps({'result': '[{\"i\":0,\"label\":\"正しい\",\"why\":\"確認\"}]'}))",
            'pdftotext': "print('実績1 実績2')",
        }.items():
            path = self.work / 'bin' / name
            path.write_text(f'#!{sys.executable}\n{body}\n')
            path.chmod(0o755)

    def test_missing_quote_judgment_requires_explicit_partial(self):
        result = self.run_script('score2.py', str(self.work))
        self.assertEqual(result.returncode, 2)
        self.assertIn('引用判定 1 件', result.stderr)
        self.assertFalse((self.work / 'score2.json').exists())
        result = self.run_script('score2.py', str(self.work), '--partial')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('暫定値', result.stdout)
        self.assertIn('/ 0 （判定済み項目）', result.stdout)

    def test_verbatim_does_not_use_unseen_chunk(self):
        self.answer['projects'][0]['fields']['実績']['quote'] = '実績2'
        self.write('judge/quotes/q.json', [{'field': '実績', 'page': 'sha:1', 'quote': '実績2', 'reading': '今年度', 'label': '正しい'}])
        result = self.run_script('score2.py', str(self.work))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(json.loads((self.work / 'score2.json').read_text())[0]['quotes'][0]['verbatim'])

    def test_pending_page_is_not_a_misattribution(self):
        self.answer['pages'].append('sha:2')
        result = self.run_script('score2.py', str(self.work))
        self.assertEqual(result.returncode, 2)
        self.assertIn('頁判定 1 件', result.stderr)
        self.run_script('score2.py', str(self.work), '--partial')
        row = json.loads((self.work / 'score2.json').read_text())[0]
        self.assertEqual(row['class'], '判定待ち')
        self.assertEqual(row['quotes'], [])

    def test_partial_and_undetermined_answers_have_no_quote_denominator(self):
        for question_set in ('S4a', 'S5-undetermined'):
            self.q['set'] = question_set
            self.q['truth'] = self.q['accept'] = ['sha:1', 'sha:2']
            result = self.run_script('score2.py', str(self.work))
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads((self.work / 'score2.json').read_text())[0]['quotes'], [])
            self.fake_judge()
            result = self.run_script('judge2.py', 'quotes', str(self.work))
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse((self.work / 'judge/quotes/q.json').exists())

    def test_quote_judge_uses_page_judgments_and_human_override(self):
        self.answer['pages'].append('sha:2')
        self.answer['projects'][0]['fields']['実績']['page'] = 'sha:2'
        self.write('judge/pages/q.json', {'sha:2': {'contains': False}})
        self.write('overrides.json', {'pages': {'q|sha:2': True}})
        self.fake_judge()
        result = self.run_script('judge2.py', 'quotes', str(self.work), str(self.work / 'overrides.json'))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads((self.work / 'judge/quotes/q.json').read_text())[0]['page'], 'sha:2')
        result = self.run_script('score2.py', str(self.work), str(self.work / 'overrides.json'))
        self.assertEqual(result.returncode, 0, result.stderr)
        row = json.loads((self.work / 'score2.json').read_text())[0]
        self.assertEqual(row['class'], '正答')
        self.assertEqual(row['added'], ['sha:2'])
        self.assertEqual(row['quotes'][0]['label'], '正しい')

    def test_usage_limit_is_unfinished_not_an_unanswered_trial(self):
        self.log = []
        self.write('agent/q.run.json', {'result': "You've hit your session limit · resets 1am (Asia/Tokyo)", 'total_cost_usd': 0})
        result = self.run_script('score2.py', str(self.work))
        self.assertEqual(result.returncode, 2)
        self.assertIn('回答 1 件', result.stderr)
        self.run_script('score2.py', str(self.work), '--partial')
        row = json.loads((self.work / 'score2.json').read_text())[0]
        self.assertEqual(row['class'], '未実行')


if __name__ == '__main__':
    unittest.main()
