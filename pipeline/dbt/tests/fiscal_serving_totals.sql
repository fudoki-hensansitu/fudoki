-- 科目の表の足し方の規則: 同じ資料で、款の和 = is_leaf の科目の和。
-- 例外は所属の冊（ADR 0030）が目を立てずに印字した項の分（281000 福祉局の2款1項 総務費 170,000円）。
-- その分の一部（役務費 132,000円）は内訳の表に is_subject_remainder として入るが、残りは冊をまたいで
-- 足すノードが無いので内訳にも無い。ここでは旧い会計の合計の検査と同じく、取り込みの行から項の分を足す。
with doc as (
    select jurisdiction_code, fiscal_year, document_kind, account_name,
        sum(amount_yen) filter (where level = '款') as kan_sum,
        sum(amount_yen) filter (where is_leaf) as leaf_sum,
        count(*) filter (where is_leaf and amount_yen is null) as leaf_missing
    from {{ ref('fiscal_expenditure_subject') }}
    group by all
), rows as (
    select * from {{ ref('int_fiscal__settlement_expenditure_rows') }}
), division_kou_without_moku as (
    select k.jurisdiction_code, k.fiscal_year, 'settlement' as document_kind, k.account_name, sum(k.amount_yen) as amount
    from rows k
    where k.division is not null and k.node_kind = '項' and k.axis_header = k.subject_axis
      and not exists (select 1 from rows m where m.source_table_key = k.source_table_key
                      and m.parent_node_key = k.node_key and m.node_kind = '目')
      -- 統合後に末端（is_leaf）になった項は leaf_sum に入っているので足さない
      and not exists (select 1 from {{ ref('fiscal_expenditure_subject') }} s
                      where s.node_key = k.node_id and s.document_kind = 'settlement' and s.is_leaf)
    group by all
)
select doc.jurisdiction_code || ':' || doc.fiscal_year || ':' || doc.document_kind || ':' || doc.account_name as key,
    kan_sum as expected, leaf_sum + coalesce(d.amount, 0) as actual
from doc
left join division_kou_without_moku d using (jurisdiction_code, fiscal_year, document_kind, account_name)
where kan_sum is not null and leaf_missing = 0 and kan_sum <> leaf_sum + coalesce(d.amount, 0)
