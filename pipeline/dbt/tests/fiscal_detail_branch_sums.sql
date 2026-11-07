-- 内訳の表の足し方の規則: 同じ科目・同じ分け方の depth = 1 の和 = 科目の額。出典の金額が部分的に欠ける科目
-- （備考・節の一部）があるので warn にし、件数を報告で見る。行の金額がすべてある科目だけを比べる。
{{ config(severity='warn') }}
with s as (select * from {{ ref('fiscal_expenditure_subject') }}),
branch as (
    select subject_id, breakdown, sum(amount_yen) as amount, count(*) filter (where amount_yen is null) as missing
    from {{ ref('fiscal_expenditure_detail') }}
    where depth = 1 and not is_subject_remainder
    group by all
)
select b.subject_id, b.breakdown, s.jurisdiction_code, s.amount_yen as expected, b.amount as actual
from branch b join s using (subject_id)
where b.missing = 0 and s.amount_yen is not null and s.amount_yen <> b.amount
