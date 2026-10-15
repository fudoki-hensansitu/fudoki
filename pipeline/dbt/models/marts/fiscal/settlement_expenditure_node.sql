-- Settlement expenditure tree. Account kinds and interfund-transfer marks come
-- from the shared intermediate (int_fiscal__expenditure_transfers); the rules
-- live there alone so settlement and initial budgets cannot drift (ADR 0023).
with unioned as (
    -- PDF trees and CSV trees share the subject node_id derivation, so they union
    -- into one table, as in initial_expenditure_node.
    select n.* from {{ ref('int_fiscal__settlement_expenditure_nodes') }} n
    where n.document_kind = 'settlement'
    union all
    select n.* from {{ ref('int_fiscal__csv_expenditure_nodes') }} n
    where n.document_kind = 'settlement'
), base as (
    select n.*, c.cofog_status, c.cofog_code
    from unioned n
    left join {{ ref('int_fiscal__settlement_expenditure_cofog') }} c using (node_id, document_kind)
)
select b.* exclude (document_kind),
    t.account_kind,
    t.is_interfund_transfer,
    t.interfund_transfer_to,
    s.expenditure_setsu_id
from base b
left join {{ ref('int_fiscal__expenditure_transfers') }} t using (node_id, document_kind)
left join {{ ref('int_fiscal__expenditure_setsu') }} s using (node_id, document_kind)
