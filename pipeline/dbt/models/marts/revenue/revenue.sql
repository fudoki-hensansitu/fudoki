-- 歳入の根: 一つの資料（自治体・年度・資料区分・補正号）の一つの会計。科目の表か内訳の表に行があるものだけ。
-- 総額は款の行の和（歳出の根の total_yen と同じく、頁の一覧で全根の総額を JOIN なしで返すために持つ。ADR 0047 の例外）。
with roots as (
    select distinct {{ revenue_id('r.') }} as revenue_id, r.jurisdiction_code, r.fiscal_year, r.document_kind,
        r.amendment_number, r.account_name, a.account_kind
    from {{ ref('int_fiscal__revenue_rows') }} r
    left join {{ ref('int_fiscal__accounts') }} a using (jurisdiction_code, fiscal_year, account_name)
    where r.row_id in (select subject_id from {{ ref('revenue_subject') }})
       or r.row_id in (select detail_id from {{ ref('revenue_detail') }})
)
select r.*,
    (select sum(s.amount_yen) from {{ ref('revenue_subject') }} s
     where s.revenue_id = r.revenue_id and s.level = '款')::bigint as total_yen
from roots r
