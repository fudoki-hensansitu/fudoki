select origin_id, jurisdiction_code, fiscal_year, document_kind, amendment_number,
    {{ trim_cell('title') }} as title, url, format, sha256
from {{ source('fiscal_metadata', 'origin') }}
