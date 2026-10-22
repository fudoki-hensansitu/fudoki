"""Admission of the heavy runs (OCR, conversion, refresh): when one may start, and why it may not."""
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from ingestion.lib import heavy_lock

CALM, BUSY = (lambda: 1), (lambda: 2)


class HeavyLockTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name) / 'heavy.lock'
        self.held = []

    def take(self, command, pressure=CALM, targets=()):
        holder = heavy_lock.acquire(command, self.path, pressure, targets)
        self.held.append(holder)
        return holder

    def refused(self, command, pressure=CALM, targets=()):
        with self.assertRaises(SystemExit) as caught:
            heavy_lock.acquire(command, self.path, pressure, targets)
        return str(caught.exception)

    def tearDown(self):
        for holder in self.held:
            holder.close()

    def test_a_lone_run_always_starts_even_under_pressure(self):
        for command in ('ocr', 'convert', 'refresh'):
            heavy_lock.acquire(command, self.path, BUSY).close()

    def test_convert_and_refresh_start_beside_ocr_when_memory_is_calm(self):
        self.take('ocr')
        self.assertIsNotNone(self.take('refresh'))
        self.assertIsNotNone(self.take('convert'))

    def test_memory_pressure_refuses_a_run_beside_another_with_the_holder(self):
        self.take('ocr')
        message = self.refused('refresh', BUSY)
        self.assertIn('memory pressure', message)
        self.assertIn('"command": "ocr"', message)
        self.assertIn('memory pressure: unreadable', self.refused('refresh', lambda: None))

    def test_convert_and_refresh_share_the_concurrency_cap(self):
        self.take('refresh')
        self.take('convert')
        for command in ('refresh', 'convert'):
            message = self.refused(command)
            self.assertIn('concurrency limit', message)
            self.assertIn('"command": "refresh"', message)

    def test_a_manifest_is_used_by_one_run_at_a_time(self):
        manifest, other = self.path.parent / 'a.json', self.path.parent / 'b.json'
        first = self.take('refresh', targets=[manifest, other])
        for command in ('convert', 'refresh'):
            message = self.refused(command, targets=[manifest])
            self.assertIn('same target', message)
            self.assertIn('"command": "refresh"', message)
        first.close()
        self.take('convert', targets=[manifest]).close()

    def test_different_manifests_run_together_and_a_refusal_keeps_nothing_held(self):
        a, b = self.path.parent / 'a.json', self.path.parent / 'b.json'
        self.take('convert', targets=[a])
        self.refused('refresh', targets=[b, a])
        self.take('refresh', targets=[b])

    def test_ocr_is_exclusive_in_both_directions(self):
        ocr = self.take('ocr')
        self.assertIn('OCR exclusion', self.refused('ocr'))
        ocr.close()
        refresh = self.take('refresh')
        message = self.refused('ocr')
        self.assertIn('OCR exclusion', message)
        self.assertIn('"command": "refresh"', message)
        refresh.close()
        self.take('ocr')

    def test_the_kernel_releases_the_lock_when_the_holder_dies(self):
        code = ('import sys,time;from pathlib import Path;from ingestion.lib import heavy_lock;'
                'h=heavy_lock.acquire("ocr",Path(sys.argv[1]));print("held",flush=True);time.sleep(60)')
        child = subprocess.Popen([sys.executable, '-c', code, str(self.path)], stdout=subprocess.PIPE, text=True)
        try:
            self.assertEqual(child.stdout.readline().strip(), 'held')
            self.assertIn('OCR exclusion', self.refused('ocr'))
        finally:
            child.kill()
            child.wait()
            child.stdout.close()
        self.take('ocr')

    def test_closing_releases_and_clears_the_holder(self):
        first = heavy_lock.acquire('ocr', self.path)
        first.close()
        self.assertEqual(self.path.read_text(), '')
        heavy_lock.acquire('ocr', self.path).close()

    def test_commands_that_do_not_occupy_the_machine_take_no_lock(self):
        self.path = self.path.parent / 'absent' / 'heavy.lock'
        self.assertIsNone(heavy_lock.acquire('check', self.path))
        self.assertFalse(self.path.exists())

    def test_the_default_path_follows_the_environment_at_call_time(self):
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary) / 'state'
            with patch.dict(os.environ, {'XDG_STATE_HOME': str(state)}, clear=False):
                os.environ.pop(heavy_lock.ENV, None)
                self.assertEqual(heavy_lock.default_path(), state / 'fudoki' / 'heavy.lock')
                with patch.dict(os.environ, {heavy_lock.ENV: str(Path(temporary) / 'override.lock')}, clear=False):
                    holder = heavy_lock.acquire('ocr')
                    try:
                        self.assertEqual(holder.path, Path(temporary) / 'override.lock')
                        self.assertFalse((state / 'fudoki' / 'heavy.lock').exists())
                    finally:
                        holder.close()
