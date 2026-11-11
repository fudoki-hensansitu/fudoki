from functools import lru_cache
import importlib
import json
from pathlib import Path
from typing import Any, NamedTuple


def catalog() -> dict:
    return json.loads(Path(__file__).with_name('catalog.json').read_text())


def entry(kind: str, name: str, *, entries: dict | None = None) -> str:
    try:
        return (catalog() if entries is None else entries)[kind][name]
    except KeyError:
        raise ValueError(f'Unknown PDF pattern: {kind}/{name}') from None


@lru_cache(maxsize=None)
def load(kind: str, name: str):
    return importlib.import_module(entry(kind, name))


class Quirk(NamedTuple):
    """A quirk the workflow selected: its module and the value the workflow gave it."""
    module: Any
    value: Any


def quirk(settings: dict | None, name: str) -> Quirk | None:
    """The opt-in quirk `name` (`generic/patterns/quirks/<name>.py`) when the settings select it, else None.

    `settings` is the document's settings for a document quirk (`workflow.quirks`) or an axis's for an axis quirk
    (`hierarchy.breakdown.<axis>.quirks`). Only a workflow that selects a quirk imports its module, so only its tables
    take the module's code into their fingerprint."""
    value = (settings or {}).get('quirks', {}).get(name)
    return None if value is None else Quirk(load('quirks', name), value)
