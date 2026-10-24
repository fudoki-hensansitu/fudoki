-- Shared account-kind and interfund-transfer marks for every expenditure document
-- (settlement and initial budgets, PDF trees and CSV trees). One row per
-- (document_kind, node_id): settlement and initial budgets share subject node_ids,
-- so the kind stays in every key instead of forking the model. Both marts join
-- this one table; the transfer-name rules live here alone (ADR 0023).
-- Account kinds come from the shared keyword dictionary, and interfund marks from
-- shared name rules. Amounts are never eliminated. A mark sits only on
-- the finest recipient-identifying breakdown, without marking its enclosing transfer twice.
-- A recipient the mark's own name leaves open is read from the nearest ancestor name
-- that prints an account kind (ancestor_name_kinds); with none it stays NULL / 不明.
with recursive unioned as (
    select node_id, parent_node_id, jurisdiction_code, fiscal_year, document_kind,
        account_name, axis, is_subject, node_kind, code, name, amount_yen
    from {{ ref('int_fiscal__settlement_expenditure_nodes') }}
    union all
    select node_id, parent_node_id, jurisdiction_code, fiscal_year, document_kind,
        account_name, axis, is_subject, node_kind, code, name, amount_yen
    from {{ ref('int_fiscal__csv_expenditure_nodes') }}
), transfer_names as (
    -- A printed department suffix does not change the recipient account.
    select *, regexp_replace(name, '【[^【】]+】$', '') as transfer_name from unioned
), transfer_named as (
    -- A transfer 目, or an off-subject breakdown (節・備考・説明) named exactly
    -- 繰出金 or matching the account pattern. Subject 項・款 never qualify, so a
    -- marked 目 keeps its mark under a transfer-named 項 (e.g. 他会計繰出金).
    select document_kind, node_id, axis, is_subject,
        case when regexp_matches(transfer_name, '^(.*会計)繰出金$')
             then regexp_extract(transfer_name, '^(.*会計)繰出金$', 1) end as own_recipient
    from transfer_names
    where (is_subject and node_kind = '目' and regexp_matches(transfer_name, '^(.*会計)繰出金$'))
       or (not is_subject and (transfer_name = '繰出金' or regexp_matches(transfer_name, '^(.*会計)繰出金$')))
), ancestors as (
    select document_kind, node_id, parent_node_id as ancestor_id, 1 as depth
    from unioned where parent_node_id is not null
    union
    select a.document_kind, a.node_id, b.parent_node_id, a.depth + 1
    from ancestors a
    join unioned b
      on b.document_kind = a.document_kind and b.node_id = a.ancestor_id
    where b.parent_node_id is not null
), nearest_moku as (
    select a.document_kind, a.node_id, ab.node_id as moku_id, ab.name as moku_name
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
    from transfer_named m
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
), ancestor_name_kinds as (
    -- A mark whose own name (and nearest 目) leaves the recipient open (NULL or 不明)
    -- reads the account names printed on its ancestors: 国民健康保険事業費 above a
    -- bare 節 繰出金. The nearest ancestor naming any account kind decides; two kinds
    -- in that one name decide nothing, and neither does a name of the account's own
    -- kind (the sender's business, not the recipient: 国民健康保険事業費 inside the
    -- 国民健康保険 account). Printed names are evidence, so a mark with no such
    -- ancestor stays as it is (no inference from the account count etc.).
    select r.document_kind, r.node_id, a.depth, k.account_kind
    from recipient_kinds r
    join ancestors a
      on a.document_kind = r.document_kind and a.node_id = r.node_id
    join unioned ab
      on ab.document_kind = a.document_kind and ab.node_id = a.ancestor_id
    join {{ ref('account_kind_map') }} k
      on coalesce(k.scope, '') = '' and nullif(k.account_kind, '') is not null
         and contains({{ fiscal_match_text('ab.name') }}, {{ fiscal_match_text('k.keyword') }})
    where r.recipient_kind is null or r.recipient_kind = '不明'
), ancestor_kinds as (
    select c.document_kind, c.node_id,
        min(c.account_kind) as ancestor_kind
    from ancestor_name_kinds c
    join (select document_kind, node_id, min(depth) as depth
          from ancestor_name_kinds group by document_kind, node_id) n
      using (document_kind, node_id, depth)
    group by c.document_kind, c.node_id
    having count(distinct c.account_kind) = 1
), classified_names as (
    -- Resolve every printed transfer name before choosing its level/axis. A
    -- known recipient in the remarks can split a 節 that combines recipients.
    select u.*, r.recipient_name, r.keyword,
        coalesce(nm.moku_id, case when u.is_subject and u.node_kind = '目' then u.node_id end) as moku_id,
        case when r.recipient_name is not null and r.keyword is null then null
             when ak.ancestor_kind is not null and ak.ancestor_kind <> a.account_kind
                  and (r.recipient_kind is null or r.recipient_kind = '不明')
             then ak.ancestor_kind else r.recipient_kind end as recipient_kind
    from transfer_named t
    join unioned u using (node_id, document_kind)
    left join nearest_moku nm using (node_id, document_kind)
    left join recipient_kinds r using (node_id, document_kind)
    left join ancestor_kinds ak using (node_id, document_kind)
    left join {{ ref('int_fiscal__expenditure_accounts') }} a
      using (jurisdiction_code, fiscal_year, account_name)
), section_recipient_axes as (
    -- A complete breakdown naming one recipient also explains a bare 節.
    -- Partial or mixed-recipient details cannot identify its whole amount.
    -- Keep existing recipient marks at their published level: only newly
    -- recognized department-qualified details can enrich the bare section.
    select s.document_kind, s.node_id, min(d.recipient_kind) as recipient_kind
    from classified_names s
    join classified_names d
      on d.document_kind = s.document_kind and d.moku_id = s.moku_id
         and not d.is_subject and d.axis <> '節'
    where s.axis = '節' and (s.recipient_kind is null or s.recipient_kind = '不明')
    group by s.document_kind, s.node_id, s.amount_yen, d.axis
    having count(distinct d.recipient_kind) = 1
       and bool_and(d.recipient_kind is not null and d.recipient_kind <> '不明')
       and bool_and(regexp_matches(d.name, '【[^【】]+】$'))
       and count(d.amount_yen) = count(*) and sum(d.amount_yen) = s.amount_yen
), section_recipients as (
    select document_kind, node_id, min(recipient_kind) as recipient_kind
    from section_recipient_axes group by document_kind, node_id
    having count(distinct recipient_kind) = 1
), classified as (
    select c.* replace (coalesce(r.recipient_kind, c.recipient_kind) as recipient_kind)
    from classified_names c left join section_recipients r using (document_kind, node_id)
), finest as (
    -- Repeated names within an axis yield to an identified recipient below.
    -- Keep 節 until identified_details proves a complete split in another axis.
    select c.* from classified c
    where not exists (
        select 1 from ancestors a join classified d
          on d.document_kind = a.document_kind and d.node_id = a.node_id
        where a.document_kind = c.document_kind and a.ancestor_id = c.node_id
          and c.axis = d.axis
          and (c.recipient_kind is null or c.recipient_kind = '不明')
          and d.recipient_kind is not null and d.recipient_kind <> '不明')
), identified_details as (
    -- An incomplete recipient split cannot replace the whole section: keep
    -- its mark when even one remaining recipient is unnamed or ambiguous.
    select document_kind, moku_id, axis from finest
    where not is_subject and axis <> '節'
      and not exists (select 1 from classified s
                      where s.document_kind = finest.document_kind and s.moku_id = finest.moku_id
                        and s.axis = '節' and s.recipient_kind is not null and s.recipient_kind <> '不明')
    group by document_kind, moku_id, axis
    having bool_and(recipient_kind is not null and recipient_kind <> '不明')
       and count(amount_yen) = count(*)
       and sum(amount_yen) = (
           select sum(s.amount_yen) from classified s
           where s.document_kind = finest.document_kind and s.moku_id = finest.moku_id and s.axis = '節')
), preferred as (
    select c.* from finest c
    where not (not c.is_subject and c.axis = '節' and exists (
        select 1 from identified_details d
        where d.document_kind = c.document_kind and d.moku_id = c.moku_id))
      and not (not c.is_subject and c.axis <> '節' and exists (
        select 1 from identified_details d
        where d.document_kind = c.document_kind and d.moku_id = c.moku_id)
        and not exists (select 1 from identified_details d
                        where d.document_kind = c.document_kind and d.moku_id = c.moku_id and d.axis = c.axis))
      and not (not c.is_subject and c.axis <> '節' and not exists (
        select 1 from identified_details d
        where d.document_kind = c.document_kind and d.moku_id = c.moku_id)
        and exists (select 1 from classified s
                    where s.document_kind = c.document_kind and s.moku_id = c.moku_id and s.axis = '節'))
), marked as (
    -- Topmost among the remaining candidates: when a known recipient below
    -- replaced its parent, unknown sibling transfers still retain their marks.
    select p.* from preferred p
    where not exists (
        select 1 from ancestors a join preferred u
          on u.document_kind = a.document_kind and u.node_id = a.ancestor_id
        where a.document_kind = p.document_kind and a.node_id = p.node_id)
)
select u.node_id, u.document_kind,
    a.account_kind,
    r.node_id is not null as is_interfund_transfer,
    case when r.node_id is null then null
         when r.recipient_name is not null and r.keyword is null
         then error('Unknown transfer recipient (no account_kind_map keyword matches): ' || r.recipient_name)
         else r.recipient_kind end as interfund_transfer_to
from unioned u
left join {{ ref('int_fiscal__expenditure_accounts') }} a
  using (jurisdiction_code, fiscal_year, account_name)
left join marked r using (node_id, document_kind)
