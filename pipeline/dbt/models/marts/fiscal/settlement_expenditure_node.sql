-- Settlement expenditure tree. Account kinds and interfund-transfer marks come
-- from the shared intermediate (int_fiscal__expenditure_transfers); the rules
-- live there alone so settlement and initial budgets cannot drift (ADR 0023).
with base as (
    select n.* exclude (kan_name, kou_name), c.cofog_status, c.cofog_code
    from {{ ref('int_fiscal__settlement_expenditure_nodes') }} n
    left join {{ ref('int_fiscal__settlement_expenditure_cofog') }} c using (node_id, document_kind)
    where n.document_kind = 'settlement'
)
select b.* exclude (document_kind),
    t.account_kind,
    t.is_interfund_transfer,
    t.interfund_transfer_to
from base b
left join {{ ref('int_fiscal__expenditure_transfers') }} t using (node_id, document_kind)
