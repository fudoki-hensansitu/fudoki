-- Initial budgets from every input shape: PDF trees (132071) and CSV trees
-- (132047) share the subject node_id derivation, so they union into one table.
-- The approved phase is selected upstream; origin.format tells PDF from CSV.
with pdf as (
    select n.* exclude (kan_name, kou_name)
    from {{ ref('int_fiscal__settlement_expenditure_nodes') }} n
    where n.document_kind = 'initial'
), csv as (
    select n.* exclude (kan_name, kou_name)
    from {{ ref('int_fiscal__csv_expenditure_nodes') }} n
), unioned as (
    select * from pdf union all select * from csv
)
select u.* exclude (document_kind), c.cofog_status, c.cofog_code
from unioned u
left join {{ ref('int_fiscal__settlement_expenditure_cofog') }} c using (node_id, document_kind)
