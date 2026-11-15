-- 事務事業評価シート。1枚（1事業）が1行。金額は出典の印字を円にしたもの。
-- 当初予算書・決算書の目への紐付けは風土記の判断（int_evaluation__sheet_subjects、列の説明を参照）。事業へのつながりは evaluation_sheet_project。
select s.sheet_id, sha256(to_json(['evaluation', s.jurisdiction_code, s.fiscal_year::varchar])) as evaluation_id,
    s.origin_id, s.jurisdiction_code, s.fiscal_year, s.page, s.name,
    s.account_name, s.kan as kan_name, s.kou as kou_name, s.moku as moku_name, s.jigyo as jigyo_name,
    s.kan_code, s.kou_code, s.moku_code,
    s.department, s.division,
    s.budget_yen, s.settled_yen,
    s.grade_label, s.direction, s.direction_code,
    j.initial_expenditure_subject_id, j.settlement_expenditure_subject_id
from {{ ref('int_evaluation__sheets') }} s
left join {{ ref('int_evaluation__sheet_subjects') }} j using (sheet_id)
