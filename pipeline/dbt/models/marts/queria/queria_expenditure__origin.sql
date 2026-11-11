-- Queria に配る出典（歳出の根から参照される冊だけ）
select origin_id, jurisdiction_code as local_government_code, fiscal_year, document_kind, amendment_number,
    title, url as source_url, format, sha256
from {{ ref('expenditure_origin') }}
where origin_id in (select origin_id from {{ ref('expenditure_origin_link') }})
