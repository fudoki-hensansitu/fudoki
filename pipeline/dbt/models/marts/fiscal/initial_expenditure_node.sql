-- Initial budgets from every input shape: PDF trees (132071) and CSV trees
-- (132047) share the subject node_id derivation, so they union into one table.
-- The approved phase is selected upstream; origin.format tells PDF from CSV.
-- Account kinds and interfund-transfer marks come from the shared intermediate
-- (int_fiscal__expenditure_transfers), the same table the settlement marts uses.
with pdf as (
    select n.*
    from {{ ref('int_fiscal__settlement_expenditure_nodes') }} n
    where n.document_kind = 'initial'
), csv as (
    select n.*
    from {{ ref('int_fiscal__csv_expenditure_nodes') }} n
    where n.document_kind = 'initial'
), unioned as (
    select * from pdf union all select * from csv
)
select u.* exclude (document_kind), c.cofog_status, c.cofog_code,
    t.account_kind,
    t.is_interfund_transfer,
    t.interfund_transfer_to,
    s.expenditure_setsu_id
from unioned u
left join {{ ref('int_fiscal__settlement_expenditure_cofog') }} c using (node_id, document_kind)
left join {{ ref('int_fiscal__expenditure_transfers') }} t using (node_id, document_kind)
left join {{ ref('int_fiscal__expenditure_setsu') }} s using (node_id, document_kind)
