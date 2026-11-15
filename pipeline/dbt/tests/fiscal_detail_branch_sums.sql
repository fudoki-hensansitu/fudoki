-- 内訳の表の足し方の規則: 同じ科目・同じ分け方の depth = 1 の和 = 科目の額。出典の金額が部分的に欠ける科目
-- （備考・節の一部）があるので warn にし、件数を報告で見る。行の金額がすべてある科目だけを比べる。
{{ config(severity='warn') }}
with s as (
    select s.subject_id, s.amount_yen, e.jurisdiction_code, sp.is_leaf
    from {{ ref('expenditure_subject') }} s
    join {{ ref('expenditure') }} e using (expenditure_id)
    join {{ ref('int_fiscal__subject_path') }} sp using (subject_id)
),
-- 末端でない科目の直下の内訳（科目の残り、ADR 0030）は比べない
branch as (
    select d.subject_id, d.breakdown, sum(d.amount_yen) as amount, count(*) filter (where d.amount_yen is null) as missing
    from {{ ref('expenditure_detail') }} d
    join s using (subject_id)
    where d.depth = 1 and s.is_leaf
    group by all
)
select b.subject_id, b.breakdown, s.jurisdiction_code, s.amount_yen as expected, b.amount as actual
from branch b join s using (subject_id)
where b.missing = 0 and s.amount_yen is not null and s.amount_yen <> b.amount
