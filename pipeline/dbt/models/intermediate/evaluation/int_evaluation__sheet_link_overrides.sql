-- 人の判断（seed の evaluation_sheet_link）を、シートの ID で引ける形にする。
select s.sheet_id, nullif(k.detail_id, '') as detail_id
from {{ ref('evaluation_sheet_link') }} k
join {{ ref('int_evaluation__sheets') }} s
    on s.jurisdiction_code = k.jurisdiction_code and s.fiscal_year = k.fiscal_year
    and s.origin_id = k.origin_id and s.page = k.page and s.position = k.position
