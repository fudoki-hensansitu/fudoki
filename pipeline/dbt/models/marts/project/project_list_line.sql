-- 事業の一覧の資料に印字された事業の行。資料の印字のまま（名前・会計・款項目・所管課・当初予算額）。
-- 科目（subject_id）は風土記が名前で当てた当初予算の科目（int_project__list_lines）。自治体・年度は出典（project_list_origin）にある。
select list_line_id, origin_id, page, position, account_name, kan as kan_name, kou as kou_name, moku as moku_name,
    name, department, budget_yen, is_new, subject_id
from {{ ref('int_project__list_lines') }}
