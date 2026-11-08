-- 事業評価・プレス発表の出典。PDF 1つが1行。
select origin_id, jurisdiction_code, document_type, fiscal_year, title, url, landing_url, sha256
from {{ source('evaluation', 'evaluation_origin') }}
