-- 予算案に載った施策。品川は予算案のプレス発表の1頁（1施策）が1行。金額は出典の千円を円にしたもの。
-- 予算書の内訳への紐付けと COFOG は風土記の判断（seed の project_budget_initiative_link）。
select sha256(to_json([p.origin_id, p.page::varchar])) as initiative_id,
    p.origin_id, o.jurisdiction_code, o.fiscal_year, p.page, p.title, p.names, p.is_new,
    p.budget_thousand * 1000 as budget_yen, p.points,
    nullif(l.detail_id, '') as detail_id, l.method as link_method, l.confidence as link_confidence,
    s.cofog_code
from {{ source('project', 'project_budget_initiative') }} p
join {{ source('project', 'project_origin') }} o using (origin_id)
left join {{ ref('project_budget_initiative_link') }} l
    on l.jurisdiction_code = o.jurisdiction_code and l.fiscal_year = o.fiscal_year and l.page = p.page
left join {{ ref('fiscal_expenditure_detail') }} d on d.detail_id = nullif(l.detail_id, '')
left join {{ ref('fiscal_expenditure_subject') }} s on s.subject_id = d.subject_id
