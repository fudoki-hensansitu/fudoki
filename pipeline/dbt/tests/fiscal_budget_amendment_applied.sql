-- A council amendment (seed fiscal_budget_amendment) applies only where it meets the budget book:
-- each declared table exists, and each amended line is a node of the budget book that printed the line's
-- 原案金額 and now holds its 修正金額 (int_fiscal__settlement_expenditure_nodes).
with lines as (
    select r.* from {{ ref('int_fiscal__settlement_expenditure_rows') }} r
    where r.is_amendment and r.amount_yen is not null and r.proposed_yen is not null
)
select a.jurisdiction_code || ':' || a.fiscal_year || ':' || a.table_id as key, 'undeclared_table' as failure
from {{ ref('fiscal_budget_amendment') }} a
where not exists (
    select 1 from {{ source('fiscal_metadata', 'tables') }} t
    where t.jurisdiction_code = a.jurisdiction_code and t.fiscal_year = a.fiscal_year
        and t.document_kind = a.document_kind and t.table_id = a.table_id
)
union all
select l.source_table_key || '/' || l.node_key, 'unmatched_line'
from lines l
left join {{ ref('int_fiscal__settlement_expenditure_nodes') }} n using (document_kind, node_id)
where n.node_id is null
    or n.amount_yen is distinct from l.amount_yen
    or n.amount_yen - n.amendment_yen is distinct from l.proposed_yen
