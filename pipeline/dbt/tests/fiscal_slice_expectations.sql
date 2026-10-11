with expected(jurisdiction_code, fiscal_year, account_name, moku_count, amount_yen) as (
    values ('131041',2025,'一般会計',141,187801267640::bigint),
           ('131156',2025,'一般会計',102,260972903444::bigint),
           ('132021',2025,'一般会計',102,93876812014::bigint)
), actual as (
    select jurisdiction_code, fiscal_year, account_name, count(*) as moku_count, sum(amount_yen) as amount_yen
    from {{ ref('settlement_expenditure_moku') }} group by 1,2,3
), leaves as (
    select jurisdiction_code, fiscal_year, account_name, axis, sum(amount_yen) as amount_yen
    from {{ ref('settlement_expenditure_node') }} where axis <> '科目' and is_leaf group by 1,2,3,4
)
select e.jurisdiction_code, 'moku_expected_count_sum' as failure from expected e
left join actual a using (jurisdiction_code, fiscal_year, account_name)
where a.moku_count is distinct from e.moku_count or a.amount_yen is distinct from e.amount_yen
union all
select e.jurisdiction_code, 'explanation_leaf_sum' from expected e
left join leaves l on e.jurisdiction_code = l.jurisdiction_code and e.fiscal_year = l.fiscal_year
    and e.account_name = l.account_name and l.axis = '備考'
where l.amount_yen is distinct from e.amount_yen
union all
select a.jurisdiction_code, 'view_count_sum' from actual a join (
    select jurisdiction_code, fiscal_year, account_name, count(*) as n, sum(amount_yen) as amount_yen
    from {{ ref('settlement_expenditure_node') }} where axis = '科目' and node_kind = '目' group by 1,2,3
) t using (jurisdiction_code, fiscal_year, account_name)
where a.moku_count <> t.n or a.amount_yen is distinct from t.amount_yen
