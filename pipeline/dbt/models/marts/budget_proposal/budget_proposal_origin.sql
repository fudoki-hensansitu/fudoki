-- 予算案の出典（プレス発表の資料）。PDF 1つが1行。
select origin_id,
    sha256(to_json(['budget_proposal', jurisdiction_code, fiscal_year::varchar])) as budget_proposal_id,
    jurisdiction_code, fiscal_year, title, url, landing_url, sha256
from {{ source('project', 'project_origin') }}
where document_type = 'press'
