-- 事業の1年度。始め・終え・親は project にだけ持ち、API が JOIN で引く。
select project_year_id, project_id, jurisdiction_code, fiscal_year, name, account_name,
    kan_name, kou_name, moku_name,
    initial_expenditure_detail_id, settlement_expenditure_detail_id,
    initial_expenditure_subject_id, settlement_expenditure_subject_id,
    budget_yen, settled_yen
from {{ ref('int_project__years') }}
