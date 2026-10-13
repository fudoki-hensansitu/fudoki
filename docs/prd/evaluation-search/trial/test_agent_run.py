"""会話の未回答と利用上限を分け、再開で検索・費用を失わないことを検査する。ネットワークは使わない。"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

RUNNER = Path(__file__).with_name('agent_run.py')
FAKE = '''#!/usr/bin/env python3
import json, os
from pathlib import Path
w = Path(os.environ['AGENT_WORK'])
qid = os.environ['AGENT_QID']
with (w / 'calls').open('a') as f: f.write(qid + '\\n')
mode = os.environ['TEST_MODE']
rows = [{'kind': 'search', 'query': 'test', 'chunks': [], 'pages': []}]
if mode == 'success': rows.append({'kind': 'answer', 'answer': {'status': 'not_found'}})
(w / 'agent' / (qid + '.jsonl')).write_text(''.join(json.dumps(r) + '\\n' for r in rows))
print(json.dumps({'result': "You've hit your session limit" if mode == 'limit' else 'done',
                  'total_cost_usd': 0.1, 'num_turns': 1}))
'''


class AgentRunTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.work = Path(self.tmp.name)
        (self.work / 'trial').mkdir()
        (self.work / 'agent').mkdir()
        (self.work / 'bin').mkdir()
        fake = self.work / 'bin' / 'claude'
        fake.write_text(FAKE)
        fake.chmod(0o755)
        (self.work / 'agent' / 'chunk_index.json').write_text('{}')
        (self.work / 'trial' / 'questions2.json').write_text(json.dumps([
            {'id': f'q{i}', 'jurisdiction': '131172', 'ask': 'test'} for i in range(3)]))

    def run_agent(self, mode, *args, relative=False):
        env = dict(os.environ, TEST_MODE=mode, PATH=str(self.work / 'bin') + os.pathsep + os.environ['PATH'])
        work = os.path.relpath(self.work) if relative else str(self.work)
        return subprocess.run([sys.executable, str(RUNNER), work, '--parallel', '1', *args],
                              env=env, capture_output=True, text=True, timeout=30)

    def calls(self):
        return (self.work / 'calls').read_text().splitlines()

    def test_unanswered_is_retried_once_and_resume_does_not_add_attempts(self):
        first = self.run_agent('fail', '--only', 'q0')
        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertEqual(self.calls(), ['q0', 'q0'])
        archive = self.work / 'agent' / 'attempts' / 'q0'
        self.assertEqual(len(list(archive.glob('*.run.json'))), 1)
        self.assertEqual(len(list(archive.glob('*.jsonl'))), 1)
        self.assertEqual(self.run_agent('fail', '--only', 'q0').returncode, 0)
        self.assertEqual(self.calls(), ['q0', 'q0'])

    def test_usage_limit_stops_queue_and_can_resume_without_spending_retry(self):
        limited = self.run_agent('limit')
        self.assertEqual(limited.returncode, 2, limited.stderr)
        self.assertEqual(self.calls(), ['q0'])
        resumed = self.run_agent('success')
        self.assertEqual(resumed.returncode, 0, resumed.stderr)
        self.assertEqual(self.calls(), ['q0', 'q0', 'q1', 'q2'])
        self.assertEqual(self.run_agent('success').returncode, 0)
        self.assertEqual(self.calls(), ['q0', 'q0', 'q1', 'q2'])
        self.assertEqual(len(list((self.work / 'agent' / 'attempts' / 'q0').glob('*.run.json'))), 1)

    def test_relative_work_directory_is_resolved_before_changing_child_cwd(self):
        result = self.run_agent('success', relative=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.calls(), ['q0', 'q1', 'q2'])
        self.assertIn('total answered 3 / 3', result.stdout)


if __name__ == '__main__':
    unittest.main()
