-- 予算案の根: 自治体の1年度（予算の年度）分の予算案のプレス発表。
select distinct sha256(to_json(['budget_proposal', jurisdiction_code, fiscal_year::varchar])) as budget_proposal_id,
    jurisdiction_code, fiscal_year
from {{ source('project', 'project_origin') }}
where document_type = 'press'
