-- 評価シートと事業のつながり。シート×事業が1行（多対多）。つなぎ方は風土記の判断（int_evaluation__sheet_projects）。
select sha256(to_json([p.sheet_id, p.project_id])) as link_id, p.sheet_id, s.jurisdiction_code, s.fiscal_year,
    p.project_id, p.method
from {{ ref('int_evaluation__sheet_projects') }} p
join {{ ref('int_evaluation__sheets') }} s using (sheet_id)
