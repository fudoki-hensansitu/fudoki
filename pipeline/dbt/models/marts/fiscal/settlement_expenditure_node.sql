-- Account kinds come from the shared keyword dictionary, and interfund marks from
-- one shared pattern on moku names (ADR 0023). Amounts are never eliminated:
-- drop marked mokus when summing across accounts to avoid double-counting.
with base as (
    select n.* exclude (kan_name, kou_name), c.cofog_status, c.cofog_code
    from {{ ref('int_fiscal__settlement_expenditure_nodes') }} n
    left join {{ ref('int_fiscal__settlement_expenditure_cofog') }} c using (node_id)
), transfer_nodes as (
    -- Only 目: same-named breakdowns (setsu・notes like 保険基盤安定繰出金) are
    -- statutory contributions inside one account, not transfers between accounts.
    select node_id, regexp_extract(name, '^(.*会計)繰出金$', 1) as recipient_name
    from base
    where is_subject and node_kind = '目' and regexp_matches(name, '^(.*会計)繰出金$')
), transfer_recipients as (
    select t.node_id, t.recipient_name,
        nullif(m.account_kind, '') as recipient_kind, m.keyword
    from transfer_nodes t
    left join {{ ref('account_kind_map') }} m
      on contains({{ fiscal_match_text('t.recipient_name') }}, {{ fiscal_match_text('m.keyword') }})
    qualify row_number() over (partition by t.node_id order by len(m.keyword) desc) = 1
)
select b.*,
    a.account_kind,
    r.node_id is not null as is_interfund_transfer,
    case when r.node_id is null then null
         when r.keyword is null
         then error('Unknown transfer recipient (no account_kind_map keyword matches): ' || r.recipient_name)
         else r.recipient_kind end as interfund_transfer_to
from base b
left join {{ ref('int_fiscal__settlement_expenditure_accounts') }} a
  using (jurisdiction_code, fiscal_year, account_name)
left join transfer_recipients r using (node_id)
