-- Account kinds come from the shared keyword dictionary, and interfund marks from
-- shared name rules (ADR 0023). Amounts are never eliminated. A mark sits only on
-- the topmost transfer-named node of a branch, so marked amounts sum without doubles.
with recursive base as (
    select n.* exclude (kan_name, kou_name), c.cofog_status, c.cofog_code
    from {{ ref('int_fiscal__settlement_expenditure_nodes') }} n
    left join {{ ref('int_fiscal__settlement_expenditure_cofog') }} c using (node_id)
), transfer_named as (
    -- A transfer 目, or an off-subject breakdown (節・備考・説明) named exactly
    -- 繰出金 or matching the account pattern. Subject 項・款 never qualify, so a
    -- marked 目 keeps its mark under a transfer-named 項 (e.g. 他会計繰出金).
    select node_id, axis, is_subject,
        case when regexp_matches(name, '^(.*会計)繰出金$')
             then regexp_extract(name, '^(.*会計)繰出金$', 1) end as own_recipient
    from base
    where (is_subject and node_kind = '目' and regexp_matches(name, '^(.*会計)繰出金$'))
       or (not is_subject and (name = '繰出金' or regexp_matches(name, '^(.*会計)繰出金$')))
), ancestors as (
    select node_id, parent_node_id as ancestor_id, 1 as depth
    from base where parent_node_id is not null
    union
    select a.node_id, b.parent_node_id, a.depth + 1
    from ancestors a join base b on b.node_id = a.ancestor_id
    where b.parent_node_id is not null
), marked as (
    select t.node_id, t.own_recipient
    from transfer_named t
    where not exists (
        select 1 from ancestors a
        join transfer_named u on u.node_id = a.ancestor_id
        where a.node_id = t.node_id)
      -- A descriptive breakdown defers to a 節 mark in the same 目 subtree, so one
      -- 目 never carries marks on two axes (e.g. 131156's 節 wins over its 備考).
      and not (
        not t.is_subject and t.axis <> '節' and exists (
            select 1 from transfer_named s
            join base sb on sb.node_id = s.node_id
            where sb.axis = '節'
              and sb.parent_node_id in (
                select ab.node_id from ancestors a
                join base ab on ab.node_id = a.ancestor_id
                where a.node_id = t.node_id and ab.is_subject and ab.node_kind = '目')))
), nearest_moku as (
    select a.node_id, ab.name as moku_name
    from ancestors a
    join base ab on ab.node_id = a.ancestor_id
    where ab.is_subject and ab.node_kind = '目'
    qualify row_number() over (partition by a.node_id order by a.depth) = 1
), recipients as (
    select m.node_id,
        coalesce(m.own_recipient,
                 case when regexp_matches(nm.moku_name, '^(.*会計)繰出金$')
                      then regexp_extract(nm.moku_name, '^(.*会計)繰出金$', 1) end) as recipient_name
    from marked m
    left join nearest_moku nm on nm.node_id = m.node_id
), recipient_kinds as (
    select r.node_id, r.recipient_name, nullif(k.account_kind, '') as recipient_kind, k.keyword
    from recipients r
    left join {{ ref('account_kind_map') }} k
      on r.recipient_name is not null
         and contains({{ fiscal_match_text('r.recipient_name') }}, {{ fiscal_match_text('k.keyword') }})
    qualify row_number() over (partition by r.node_id order by len(k.keyword) desc) = 1
)
select b.*,
    a.account_kind,
    r.node_id is not null as is_interfund_transfer,
    case when r.node_id is null then null
         when r.recipient_name is null then null
         when r.keyword is null
         then error('Unknown transfer recipient (no account_kind_map keyword matches): ' || r.recipient_name)
         else r.recipient_kind end as interfund_transfer_to
from base b
left join {{ ref('int_fiscal__settlement_expenditure_accounts') }} a
  using (jurisdiction_code, fiscal_year, account_name)
left join recipient_kinds r using (node_id)
