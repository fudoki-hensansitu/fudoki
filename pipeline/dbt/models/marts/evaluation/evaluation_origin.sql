-- 事業評価の出典（評価シートの資料・評価結果の資料）。PDF 1つが1行。
select origin_id,
    sha256(to_json(['evaluation', jurisdiction_code, fiscal_year::varchar])) as evaluation_id,
    jurisdiction_code, document_type, fiscal_year, title, url, landing_url, sha256
from {{ source('project', 'project_origin') }}
where document_type in ('sheets', 'result')
