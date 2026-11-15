-- 評価シートをつなぐ候補の事業の行。事業の行（int_project__lines）に事業ID・所管課・会計の種類を合わせたもの。
select l.detail_id, l.parent_detail_id, l.subject_id, l.jurisdiction_code, l.fiscal_year, l.account_name,
    e.account_kind, l.name, d.department, i.project_id
from {{ ref('int_project__lines') }} l
join {{ ref('int_project__line_ids') }} i using (detail_id)
join {{ ref('expenditure_detail') }} d using (detail_id)
join {{ ref('expenditure') }} e on e.expenditure_id = d.expenditure_id
