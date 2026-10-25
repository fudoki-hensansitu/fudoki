from functools import lru_cache
import importlib
import json
from pathlib import Path


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
