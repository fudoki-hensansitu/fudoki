-- 歳出の根: 一つの資料（自治体・年度・資料区分・補正号）の一つの会計。科目の表か内訳の表に行があるものだけ。
-- 出典の選定結果は使わない（選定しても表に行が無ければ検索で返らない）。
select distinct expenditure_id, jurisdiction_code, fiscal_year, document_kind, amendment_number, account_name, account_kind
from (
    select expenditure_id, jurisdiction_code, fiscal_year, document_kind, amendment_number, account_name, account_kind
    from {{ ref('expenditure_subject') }}
    union
    select expenditure_id, jurisdiction_code, fiscal_year, document_kind, amendment_number, account_name, account_kind
    from {{ ref('expenditure_detail') }}
)
