-- Distinct accounts in every expenditure input (PDF trees and CSV trees) with
-- their cross-jurisdiction kind. The kind comes from one shared keyword
-- dictionary (account_kind_map): an account name containing 国民健康保険 is
-- 国民健康保険 no matter which jurisdiction prints it. An account matching no
-- keyword stops the build with its name; add an explicit keyword row instead
-- of silently grouping it into a catch-all kind (ADR 0023).
with accounts as (
    select distinct jurisdiction_code, fiscal_year, account_name
    from {{ ref('int_fiscal__settlement_expenditure_nodes') }}
    union
    select distinct jurisdiction_code, fiscal_year, account_name
    from {{ ref('int_fiscal__csv_expenditure_nodes') }}
), matched as (
    select a.*,
        nullif(m.account_kind, '') as account_kind
    from accounts a
    left join {{ ref('account_kind_map') }} m
      on contains({{ fiscal_match_text('a.account_name') }}, {{ fiscal_match_text('m.keyword') }})
    qualify row_number() over (
        partition by a.jurisdiction_code, a.fiscal_year, a.account_name
        order by len(m.keyword) desc) = 1
)
select jurisdiction_code, fiscal_year, account_name,
    case when account_kind is null
         then error('Unknown account name (no account_kind_map keyword matches): ' || account_name)
         else account_kind end as account_kind
from matched
