-- 事業評価の根: 自治体の1年度（評価した事業を行った年度）分の事務事業評価。評価シートがある年度が1行。
select distinct sha256(to_json(['evaluation', jurisdiction_code, fiscal_year::varchar])) as evaluation_id,
    jurisdiction_code, fiscal_year
from {{ source('project', 'project_origin') }}
where document_type = 'sheets'
