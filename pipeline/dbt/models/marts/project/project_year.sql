-- 事業の1年度。事業の始めた年度・終えた年度・親を、年度で絞って探せるよう事業から写す（同じ集約の中の列）。
select y.project_year_id, y.project_id, y.jurisdiction_code, y.fiscal_year, y.name, y.account_name,
    y.kan_name, y.kou_name, y.moku_name,
    y.initial_expenditure_detail_id, y.settlement_expenditure_detail_id,
    y.initial_expenditure_subject_id, y.settlement_expenditure_subject_id,
    y.budget_yen, y.settled_yen,
    p.first_year, p.first_year_kind, p.last_year, p.last_year_kind, p.parent_project_id
from {{ ref('int_project__years') }} y
join {{ ref('project') }} p using (project_id)
