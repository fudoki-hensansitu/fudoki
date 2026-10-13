-- Shared account-kind and interfund-transfer marks for every expenditure document
-- (settlement and initial budgets, PDF trees and CSV trees). One row per
-- (document_kind, node_id): settlement and initial budgets share subject node_ids,
-- so the kind stays in every key instead of forking the model. Both marts join
-- this one table; the transfer-name rules live here alone (ADR 0023).
-- Account kinds come from the shared keyword dictionary, and interfund marks from
-- shared name rules. Amounts are never eliminated. A mark sits only on
-- the topmost transfer-named node of a branch, so marked amounts sum without doubles.
with recursive unioned as (
    select node_id, parent_node_id, jurisdiction_code, fiscal_year, document_kind,
        account_name, axis, is_subject, node_kind, code, name
    from {{ ref('int_fiscal__settlement_expenditure_nodes') }}
    union all
    select node_id, parent_node_id, jurisdiction_code, fiscal_year, document_kind,
        account_name, axis, is_subject, node_kind, code, name
    from {{ ref('int_fiscal__csv_expenditure_nodes') }}
), transfer_named as (
    -- A transfer 目, or an off-subject breakdown (節・備考・説明) named exactly
    -- 繰出金 or matching the account pattern. Subject 項・款 never qualify, so a
    -- marked 目 keeps its mark under a transfer-named 項 (e.g. 他会計繰出金).
    select document_kind, node_id, axis, is_subject,
        case when regexp_matches(name, '^(.*会計)繰出金$')
             then regexp_extract(name, '^(.*会計)繰出金$', 1) end as own_recipient
    from unioned
    where (is_subject and node_kind = '目' and regexp_matches(name, '^(.*会計)繰出金$'))
       or (not is_subject and (name = '繰出金' or regexp_matches(name, '^(.*会計)繰出金$')))
), ancestors as (
    select document_kind, node_id, parent_node_id as ancestor_id, 1 as depth
    from unioned where parent_node_id is not null
    union
    select a.document_kind, a.node_id, b.parent_node_id, a.depth + 1
    from ancestors a
    join unioned b
      on b.document_kind = a.document_kind and b.node_id = a.ancestor_id
    where b.parent_node_id is not null
), marked as (
    select t.document_kind, t.node_id, t.own_recipient
    from transfer_named t
    where not exists (
        select 1 from ancestors a
        join transfer_named u
          on u.document_kind = a.document_kind and u.node_id = a.ancestor_id
        where a.document_kind = t.document_kind and a.node_id = t.node_id)
      -- A descriptive breakdown defers to a 節 mark in the same 目 subtree, so one
      -- 目 never carries marks on two axes (e.g. 131156's 節 wins over its 備考).
      -- Same-目 is judged by ancestor chains, not direct parents, so nested 節
      -- (節 under 事業, 132021-style) also suppresses.
      and not (
        not t.is_subject and t.axis <> '節' and exists (
            select 1 from transfer_named s
            join unioned sb
              on sb.document_kind = s.document_kind and sb.node_id = s.node_id
            where sb.axis = '節'
              and exists (
                select 1 from ancestors a1
                join unioned m1
                  on m1.document_kind = a1.document_kind and m1.node_id = a1.ancestor_id
                where a1.document_kind = sb.document_kind and a1.node_id = sb.node_id
                  and m1.is_subject and m1.node_kind = '目'
                  and m1.node_id in (
                    select ab.node_id from ancestors a2
                    join unioned ab
                      on ab.document_kind = a2.document_kind and ab.node_id = a2.ancestor_id
                    where a2.document_kind = t.document_kind and a2.node_id = t.node_id
                      and ab.is_subject and ab.node_kind = '目'))))
), nearest_moku as (
    select a.document_kind, a.node_id, ab.name as moku_name
    from ancestors a
    join unioned ab
      on ab.document_kind = a.document_kind and ab.node_id = a.ancestor_id
    where ab.is_subject and ab.node_kind = '目'
    qualify row_number() over (partition by a.document_kind, a.node_id order by a.depth) = 1
), recipients as (
    select m.document_kind, m.node_id,
        coalesce(m.own_recipient,
                 case when regexp_matches(nm.moku_name, '^(.*会計)繰出金$')
                      then regexp_extract(nm.moku_name, '^(.*会計)繰出金$', 1) end) as recipient_name
    from marked m
    left join nearest_moku nm
      on nm.document_kind = m.document_kind and nm.node_id = m.node_id
), recipient_kinds as (
    select r.document_kind, r.node_id, r.recipient_name, nullif(k.account_kind, '') as recipient_kind, k.keyword
    from recipients r
    left join {{ ref('account_kind_map') }} k
      on r.recipient_name is not null
         -- a `recipient` row names the whole recipient (`特別会計`: no account is identified), the others a word in it
         and case when coalesce(k.scope, '') = 'recipient'
                  then {{ fiscal_match_text('r.recipient_name') }} = {{ fiscal_match_text('k.keyword') }}
                  else contains({{ fiscal_match_text('r.recipient_name') }}, {{ fiscal_match_text('k.keyword') }}) end
    qualify row_number() over (partition by r.document_kind, r.node_id order by len(k.keyword) desc) = 1
)
select u.node_id, u.document_kind,
    a.account_kind,
    r.node_id is not null as is_interfund_transfer,
    case when r.node_id is null then null
         when r.recipient_name is null then null
         when r.keyword is null
         then error('Unknown transfer recipient (no account_kind_map keyword matches): ' || r.recipient_name)
         else r.recipient_kind end as interfund_transfer_to
from unioned u
left join {{ ref('int_fiscal__expenditure_accounts') }} a
  using (jurisdiction_code, fiscal_year, account_name)
left join recipient_kinds r using (node_id, document_kind)
