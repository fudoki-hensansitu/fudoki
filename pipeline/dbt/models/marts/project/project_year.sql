-- 事業の1年度。当初予算と決算の事業の行（内訳）、または事業の一覧の資料の行を指す外部キーだけを持つ。
-- 名前・会計・款項目・科目・金額は指した行にあり、始め・終え・親は project にあるので、ここには写さない（API が JOIN で引く）。
select project_year_id, project_id, fiscal_year,
    initial_expenditure_detail_id, settlement_expenditure_detail_id,
    -- 事業の一覧の行から事業を作るのは、API が一覧の行を読めるようになってから（D1 に一覧の表が入った後の変更）
    null::varchar as initial_project_list_line_id
from {{ ref('int_project__years') }}
