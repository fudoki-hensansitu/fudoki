"""One machine-wide lock keeps the heavy runs (OCR, conversion, refresh) from overlapping."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ingestion.lib import heavy_lock


class HeavyLockTest(unittest.TestCase):
    def test_a_second_heavy_run_exits_with_the_holder(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'heavy.lock'
            first = heavy_lock.acquire('refresh', path)
            self.assertIsNotNone(first)
            try:
                with self.assertRaises(SystemExit) as caught:
                    heavy_lock.acquire('convert', path)
                self.assertIn('"command": "refresh"', str(caught.exception))
                self.assertIn(str(path), str(caught.exception))
            finally:
                first.close()
            second = heavy_lock.acquire('convert', path)
            self.assertIsNotNone(second)
            second.close()
            self.assertEqual(path.read_text(), '')

    def test_commands_that_do_not_occupy_the_machine_take_no_lock(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'absent' / 'heavy.lock'
            self.assertIsNone(heavy_lock.acquire('check', path))
            self.assertFalse(path.exists())

    def test_the_default_path_follows_the_environment_at_call_time(self):
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary) / 'state'
            with patch.dict(os.environ, {'XDG_STATE_HOME': str(state)}, clear=False):
                os.environ.pop(heavy_lock.ENV, None)
                self.assertEqual(heavy_lock.default_path(), state / 'fudoki' / 'heavy.lock')
                with patch.dict(os.environ, {heavy_lock.ENV: str(Path(temporary) / 'override.lock')}, clear=False):
                    holder = heavy_lock.acquire('convert')
                    try:
                        self.assertEqual(holder.path, Path(temporary) / 'override.lock')
                        self.assertFalse((state / 'fudoki' / 'heavy.lock').exists())
                    finally:
                        holder.close()
