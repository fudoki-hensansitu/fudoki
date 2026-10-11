"""Shared dbt staging normalization."""

import unicodedata

from dbt.adapters.duckdb.plugins import BasePlugin
from shared.amount import number as parse_printed_amount


def normalize_text(value: str) -> str:
    return unicodedata.normalize('NFKC', value).strip()


def normalize_amount(value: str) -> int:
    number = parse_printed_amount(value)
    if number is None:
        raise ValueError(f'Invalid integer amount: {value!r}')
    return number


class Plugin(BasePlugin):
    def configure_connection(self, conn):
        conn.create_function('staging_text', normalize_text)
        conn.create_function('staging_amount', normalize_amount)
