-- Per account, the subject-level sums must agree: moku sums equal kan sums.
-- Compare one axis only; mixing axes double-counts. CSV parents hold subtree
-- sums by construction, PDF parents hold printed amounts; both must close.
with account_sums as (
    select jurisdiction_code, fiscal_year, account_name,
        sum(amount_yen) filter (where node_kind = '款') as kan_sum,
        sum(amount_yen) filter (where node_kind = '項') as kou_sum,
        sum(amount_yen) filter (where node_kind = '目') as moku_sum,
        count(*) filter (where node_kind = '目') as moku_count
    from {{ ref('initial_expenditure_node') }}
    where is_subject
    group by 1, 2, 3
)
select jurisdiction_code, fiscal_year, account_name, 'account_level_sums' as failure,
    kan_sum, kou_sum, moku_sum
from account_sums
where case when moku_count > 0 then moku_sum else kou_sum end is distinct from kan_sum
  and kan_sum is not null
  and (moku_count > 0 or kou_sum is not null)
