-- Every account carries a kind from the shared dictionary (account_kind_map is
-- the source of truth; the vocabulary lives there, not here), and every
-- identified transfer recipient does too. Unidentified recipients (他会計繰出金)
-- keep the mark with a NULL recipient instead of a guessed kind.
-- Marks sit only on transfer-named nodes, without marking two axes of one 目.
-- Eligibility mirrors the marts rule; nesting and axis checks are invariants.
with recursive transfer_names as (
    select *, regexp_replace(name, '【[^【】]+】$', '') as transfer_name
    from (select * from {{ ref('int_fiscal__expenditure_nodes') }} where document_kind = 'settlement')
), eligible as (
    select node_id from transfer_names
    where (is_subject and node_kind = '目' and regexp_matches(transfer_name, '^(.*会計)繰出金$'))
       or (not is_subject and (transfer_name = '繰出金' or regexp_matches(transfer_name, '^(.*会計)繰出金$')))
), ancestors as (
    select node_id, parent_node_id as ancestor_id
    from (select * from {{ ref('int_fiscal__expenditure_nodes') }} where document_kind = 'settlement') where parent_node_id is not null
    union
    select a.node_id, b.parent_node_id from ancestors a
    join (select * from {{ ref('int_fiscal__expenditure_nodes') }} where document_kind = 'settlement') b on b.node_id = a.ancestor_id
    where b.parent_node_id is not null
), marked as (
    select node_id from (select * from {{ ref('int_fiscal__expenditure_nodes') }} where document_kind = 'settlement') where is_interfund_transfer
)
select node_id, 'bad_account_kind' as failure, account_kind as value
from (select * from {{ ref('int_fiscal__expenditure_nodes') }} where document_kind = 'settlement')
where account_kind not in (
    select account_kind from {{ ref('account_kind_map') }}
    where account_kind is not null and account_kind <> '' and coalesce(scope, '') = '')
union all
select node_id, 'bad_transfer_recipient', interfund_transfer_to
from (select * from {{ ref('int_fiscal__expenditure_nodes') }} where document_kind = 'settlement')
where interfund_transfer_to is not null
  and interfund_transfer_to not in (
    select account_kind from {{ ref('account_kind_map') }}
    where account_kind is not null and account_kind <> '')
union all
select node_id, 'transfer_recipient_without_mark', interfund_transfer_to
from (select * from {{ ref('int_fiscal__expenditure_nodes') }} where document_kind = 'settlement')
where interfund_transfer_to is not null and not is_interfund_transfer
union all
select node_id, 'transfer_mark_ineligible', cast(null as varchar)
from (select * from {{ ref('int_fiscal__expenditure_nodes') }} where document_kind = 'settlement')
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
join (select * from {{ ref('int_fiscal__expenditure_nodes') }} where document_kind = 'settlement') n on n.node_id = m.node_id
where not n.is_subject and n.axis <> '節'
  and exists (
    select 1 from marked e
    join (select * from {{ ref('int_fiscal__expenditure_nodes') }} where document_kind = 'settlement') eb on eb.node_id = e.node_id
    where eb.axis = '節'
      and exists (
        select 1 from ancestors a1
        join (select * from {{ ref('int_fiscal__expenditure_nodes') }} where document_kind = 'settlement') m1 on m1.node_id = a1.ancestor_id
        where a1.node_id = eb.node_id and m1.is_subject and m1.node_kind = '目'
          and m1.node_id in (
            select ab.node_id from ancestors a2
            join (select * from {{ ref('int_fiscal__expenditure_nodes') }} where document_kind = 'settlement') ab on ab.node_id = a2.ancestor_id
            where a2.node_id = m.node_id and ab.is_subject and ab.node_kind = '目')))
