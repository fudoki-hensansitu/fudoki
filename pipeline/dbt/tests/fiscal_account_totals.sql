-- Per account, the subject-level sums must agree: moku sums equal kan sums, and for
-- accounts without moku nodes (132012介護・後期高齢者) kou sums equal kan sums.
-- Printed account totals do not exist as nodes in these tables, so the kan sum is
-- the account total. Compare one axis only; mixing axes double-counts.
-- A division table (所属, ADR 0030) may print its share of a 項 with no 目 under it
-- (281000 福祉局の2款1項 総務費): at the moku level that share counts as itself.
-- A 款 or 項 whose children the original does not all print (132012's 主要な施策の成果報告書 skips the 項 of no
-- major measure) is declared in the layout file (`source_inconsistencies`); its declared gap is taken off the
-- level above the missing children.
with declared_gaps as (
    select n.jurisdiction_code, n.fiscal_year, n.account_name,
        sum(d.printed_yen - d.children_sum_yen) filter (where n.node_kind = '款') as kan_gap,
        sum(d.printed_yen - d.children_sum_yen) as moku_gap
    from {{ source('fiscal_metadata', 'source_inconsistencies') }} d
    join {{ ref('int_fiscal__expenditure_nodes') }} n
      on n.document_kind = 'settlement' and n.is_subject and d.document_kind = n.document_kind
     and d.jurisdiction_code = n.jurisdiction_code and d.fiscal_year = n.fiscal_year
     and d.account_name = n.account_name and d.page = n.source_page
     and d.parent_code is not distinct from n.code and d.parent_name = n.name and d.printed_yen = n.amount_yen
    where n.node_kind in ('款', '項')
    group by 1, 2, 3
), account_sums as (
    select jurisdiction_code, fiscal_year, account_name,
        sum(amount_yen) filter (where node_kind = '款') as kan_sum,
        sum(amount_yen) filter (where node_kind = '項') as kou_sum,
        sum(amount_yen) filter (where node_kind = '目') as moku_sum,
        count(*) filter (where node_kind = '目') as moku_count
    from (select * from {{ ref('int_fiscal__expenditure_nodes') }} where document_kind = 'settlement')
    where is_subject
    group by 1, 2, 3
), rows as (
    select * from {{ ref('int_fiscal__rows') }} where direction = 'expenditure'
), division_kou_without_moku as (
    select k.jurisdiction_code, k.fiscal_year, k.account_name, sum(k.amount_yen) as amount
    from rows k
    where k.division is not null and k.node_kind = '項' and k.axis_header = k.subject_axis
      and not exists (select 1 from rows m where m.source_table_key = k.source_table_key
                      and m.parent_node_key = k.node_key and m.node_kind = '目')
    group by 1, 2, 3
)
select jurisdiction_code, fiscal_year, account_name, 'account_level_sums' as failure,
    kan_sum, kou_sum, moku_sum
from account_sums
left join division_kou_without_moku d using (jurisdiction_code, fiscal_year, account_name)
left join declared_gaps g using (jurisdiction_code, fiscal_year, account_name)
where case when moku_count > 0 then moku_sum + coalesce(d.amount, 0) + coalesce(g.moku_gap, 0)
           else kou_sum + coalesce(g.kan_gap, 0) end is distinct from kan_sum
  and kan_sum is not null
  and (moku_count > 0 or kou_sum is not null)
