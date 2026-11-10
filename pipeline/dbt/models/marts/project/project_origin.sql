-- 事業についての資料（事業評価・予算案のプレス発表）の出典。PDF 1つが1行。
select origin_id, jurisdiction_code, document_type, fiscal_year, title, url, landing_url, sha256
from {{ source('project', 'project_origin') }}
