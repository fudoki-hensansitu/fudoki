-- Every account carries a kind from the shared 8-term vocabulary, and every
-- identified transfer recipient does too. Unidentified recipients (他会計繰出金)
-- keep the mark with a NULL recipient instead of a guessed kind.
-- Marks sit only on transfer-named nodes, topmost per branch, one axis per 目.
-- Eligibility mirrors the marts rule; nesting and axis checks are invariants.
with recursive eligible as (
    select node_id from {{ ref('settlement_expenditure_node') }}
    where (is_subject and node_kind = '目' and regexp_matches(name, '^(.*会計)繰出金$'))
       or (not is_subject and (name = '繰出金' or regexp_matches(name, '^(.*会計)繰出金$')))
), ancestors as (
    select node_id, parent_node_id as ancestor_id
    from {{ ref('settlement_expenditure_node') }} where parent_node_id is not null
    union
    select a.node_id, b.parent_node_id from ancestors a
    join {{ ref('settlement_expenditure_node') }} b on b.node_id = a.ancestor_id
    where b.parent_node_id is not null
), marked as (
    select node_id from {{ ref('settlement_expenditure_node') }} where is_interfund_transfer
)
select node_id, 'bad_account_kind' as failure, account_kind as value
from {{ ref('settlement_expenditure_node') }}
where account_kind not in ('一般会計', '国民健康保険', '介護保険', '後期高齢者医療', '用地', '駐車場', '下水道', '介護サービス事業')
union all
select node_id, 'bad_transfer_recipient', interfund_transfer_to
from {{ ref('settlement_expenditure_node') }}
where interfund_transfer_to is not null
  and interfund_transfer_to not in ('一般会計', '国民健康保険', '介護保険', '後期高齢者医療', '用地', '駐車場', '下水道', '介護サービス事業')
union all
select node_id, 'transfer_recipient_without_mark', interfund_transfer_to
from {{ ref('settlement_expenditure_node') }}
where interfund_transfer_to is not null and not is_interfund_transfer
union all
select node_id, 'transfer_mark_ineligible', cast(null as varchar)
from {{ ref('settlement_expenditure_node') }}
where is_interfund_transfer and node_id not in (select node_id from eligible)
union all
select m.node_id, 'transfer_mark_nested', cast(null as varchar)
from marked m
where exists (
    select 1 from ancestors a
    join marked u on u.node_id = a.ancestor_id
    where a.node_id = m.node_id)
union all
select m.node_id, 'transfer_mark_two_axes', cast(null as varchar)
from marked m
join {{ ref('settlement_expenditure_node') }} n on n.node_id = m.node_id
where not n.is_subject and n.axis <> '節'
  and exists (
    select 1 from eligible e
    join {{ ref('settlement_expenditure_node') }} eb on eb.node_id = e.node_id
    where eb.axis = '節'
      and exists (
        select 1 from ancestors a1
        join {{ ref('settlement_expenditure_node') }} m1 on m1.node_id = a1.ancestor_id
        where a1.node_id = eb.node_id and m1.is_subject and m1.node_kind = '目'
          and m1.node_id in (
            select ab.node_id from ancestors a2
            join {{ ref('settlement_expenditure_node') }} ab on ab.node_id = a2.ancestor_id
            where a2.node_id = m.node_id and ab.is_subject and ab.node_kind = '目')))
