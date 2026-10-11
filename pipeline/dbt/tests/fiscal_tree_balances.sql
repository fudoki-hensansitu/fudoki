with nodes as (select * from {{ ref('int_fiscal__settlement_expenditure_nodes') }}),
children as (
    select parent_node_id, axis, sum(amount_yen) as amount_yen, count(*) as n, count(amount_yen) as amounts
    from nodes where parent_node_id is not null group by 1,2
), mokus as (
    select jurisdiction_code, fiscal_year, account_name, kan_code, sum(amount_yen) as amount_yen
    from nodes where axis = '科目' and node_kind = '目' group by 1,2,3,4
)
select p.node_id, 'children_sum' as failure from nodes p join children c on c.parent_node_id = p.node_id
where p.amount_yen is not null and c.n = c.amounts and c.amount_yen <> p.amount_yen
union all
select k.node_id, 'moku_sum' from nodes k join mokus m using (jurisdiction_code, fiscal_year, account_name, kan_code)
where k.axis = '科目' and k.node_kind = '款' and k.amount_yen is distinct from m.amount_yen
