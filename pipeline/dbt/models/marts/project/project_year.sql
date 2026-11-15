-- 事業の1年度。当初予算と決算の事業の行（内訳）を指す外部キーだけを持つ。
-- 名前・会計・款項目・科目・金額は内訳にあり、始め・終え・親は project にあるので、ここには写さない（API が JOIN で引く）。
select project_year_id, project_id, fiscal_year,
    initial_expenditure_detail_id, settlement_expenditure_detail_id
from {{ ref('int_project__years') }}
