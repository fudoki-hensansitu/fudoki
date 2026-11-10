-- 予算案に載った施策（measure）。品川は予算案のプレス発表の1頁（1施策）が1行。金額は出典の千円を円にしたもの。
-- 予算書の内訳への紐付けは風土記の判断（seed の project_budget_initiative_link）。説明は資料の箇条書きを改行でつないだもの。
select sha256(to_json([p.origin_id, p.page::varchar])) as measure_id,
    sha256(to_json(['budget_proposal', o.jurisdiction_code, o.fiscal_year::varchar])) as budget_proposal_id,
    p.origin_id, o.jurisdiction_code, o.fiscal_year, p.page, p.title, p.names, p.is_new,
    p.budget_thousand * 1000 as budget_yen,
    array_to_string(from_json(p.points, '["VARCHAR"]'), chr(10)) as description,
    nullif(l.detail_id, '') as detail_id, l.method as link_method, l.confidence as link_confidence
from {{ source('project', 'project_budget_initiative') }} p
join {{ source('project', 'project_origin') }} o using (origin_id)
left join {{ ref('project_budget_initiative_link') }} l
    on l.jurisdiction_code = o.jurisdiction_code and l.fiscal_year = o.fiscal_year and l.page = p.page
