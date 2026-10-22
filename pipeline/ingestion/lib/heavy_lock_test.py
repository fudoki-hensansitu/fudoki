"""Admission of the heavy runs (OCR, conversion, refresh): when one may start, and why it may not."""
import os
import tempfile
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

    def take(self, command, pressure=CALM):
        holder = heavy_lock.acquire(command, self.path, pressure)
        self.held.append(holder)
        return holder

    def refused(self, command, pressure=CALM):
        with self.assertRaises(SystemExit) as caught:
            heavy_lock.acquire(command, self.path, pressure)
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

    def test_the_same_kind_is_capped(self):
        self.take('refresh')
        self.take('refresh')
        message = self.refused('refresh')
        self.assertIn('same-kind limit', message)
        self.assertIn('"command": "refresh"', message)
        self.assertIsNotNone(self.take('convert'))

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
