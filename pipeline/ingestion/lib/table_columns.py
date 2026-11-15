"""Columns of the node and amount Parquet tables. A leaf module: the build (prepare.py) imports it, so it must not
import the converters (a converter change would otherwise make `publish` rebuild every jurisdiction)."""
from ingestion.lib.parquet import ParquetColumn

NODE_COLUMNS = tuple(ParquetColumn(name, kind) for name, kind in (
    ('node_key', 'VARCHAR'), ('parent_node_key', 'VARCHAR'), ('axis_header', 'VARCHAR'),
    ('depth', 'BIGINT'), ('level_header', 'VARCHAR'), ('code_text', 'VARCHAR'),
    ('name_text', 'VARCHAR'), ('physical_page', 'BIGINT'),
    ('x0', 'DOUBLE'), ('y0', 'DOUBLE'), ('x1', 'DOUBLE'), ('y1', 'DOUBLE')))
# Amount positions are nullable: unknown pages never inherit a label position.
AMOUNT_COLUMNS = tuple(ParquetColumn(name, kind) for name, kind in (
    ('node_key', 'VARCHAR'), ('header_path', 'VARCHAR'), ('amount_text', 'VARCHAR'),
    ('unit_text', 'VARCHAR'), ('physical_page', 'BIGINT'),
    ('x0', 'DOUBLE'), ('y0', 'DOUBLE'), ('x1', 'DOUBLE'), ('y1', 'DOUBLE')))
