with recursive nodes as (select * from {{ ref('int_fiscal__settlement_expenditure_nodes') }}),
child_values as (
    select parent_node_id as checked_node_id, document_kind, axis, node_id, amount_yen
    from nodes where parent_node_id is not null
    union all
    select v.checked_node_id, v.document_kind, v.axis, c.node_id, c.amount_yen
    from child_values v join nodes c on c.parent_node_id = v.node_id and c.axis = v.axis
        and c.document_kind = v.document_kind
    where v.amount_yen is null
), children as (
    -- Missing print uses descendants on the same axis; an empty leaf contributes zero.
    -- Stop each branch at its first printed value, retaining separate breakdown axes.
    select checked_node_id, document_kind, axis, sum(coalesce(amount_yen, 0)) as amount_yen
    from child_values v
    where v.amount_yen is not null or not exists (
        -- Read the table, not the recursive CTE: a third CTE reference does not bind here.
        select 1 from {{ ref('int_fiscal__settlement_expenditure_nodes') }} c
        where c.parent_node_id = v.node_id and c.axis = v.axis
            and c.document_kind = v.document_kind
    )
    group by 1,2,3
), printed_axes as (
    -- Axes without any printed amount (e.g. funding-source breakdowns excluded from
    -- totals) have nothing to reconcile, so they never fail the sum check.
    select distinct checked_node_id, document_kind, axis from child_values where amount_yen is not null
)
select p.node_id, 'children_sum' as failure
from nodes p
join children c on c.checked_node_id = p.node_id and c.document_kind = p.document_kind
join printed_axes a on a.checked_node_id = c.checked_node_id
    and a.document_kind = c.document_kind and a.axis = c.axis
where p.amount_yen is not null and c.amount_yen <> p.amount_yen
