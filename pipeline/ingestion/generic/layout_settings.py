"""Read and validate the optional layout hints beside a direction's declaration."""
import json
from functools import lru_cache
from pathlib import Path

import jsonschema


@lru_cache(maxsize=1)
def validator():
    return jsonschema.Draft202012Validator(json.loads(Path(__file__).with_name('layout_settings.schema.json').read_text()))


def load(target: dict, direction: str) -> dict | None:
    from ingestion.fiscal.manifest import manifest_path
    path = manifest_path(target, direction).with_suffix('.layout.json')
    try:
        document = json.loads(path.read_text())
    except FileNotFoundError:
        return None
    validator().validate(document)
    return document
