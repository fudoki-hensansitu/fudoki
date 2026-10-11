with recursive nodes as (select * from {{ ref('int_fiscal__settlement_expenditure_nodes') }}),
child_values as (
    select parent_node_id as checked_node_id, axis, node_id, amount_yen
    from nodes where parent_node_id is not null
    union all
    select v.checked_node_id, v.axis, c.node_id, c.amount_yen
    from child_values v join nodes c on c.parent_node_id = v.node_id and c.axis = v.axis
    where v.amount_yen is null
), children as (
    -- Missing print uses descendants on the same axis; an empty leaf contributes zero.
    -- Stop each branch at its first printed value, retaining separate breakdown axes.
    select checked_node_id, axis, sum(coalesce(amount_yen, 0)) as amount_yen
    from child_values v
    where v.amount_yen is not null or not exists (
        select 1 from nodes c where c.parent_node_id = v.node_id and c.axis = v.axis
    )
    group by 1,2
)
select p.node_id, 'children_sum' as failure
from nodes p join children c on c.checked_node_id = p.node_id
where p.amount_yen is not null and c.amount_yen <> p.amount_yen
