-- 収録範囲: 歳出の科目の表に行がある自治体・年度・資料区分・会計と、その資料の出典（内訳の出典も含む）。
-- 出典の選定結果は使わない（選定しても表に行が無ければ検索で返らない）。
with rows as (
    select jurisdiction_code, fiscal_year, document_kind, account_name, account_kind, origin_id
    from {{ ref('fiscal_expenditure_subject') }}
    union
    select jurisdiction_code, fiscal_year, document_kind, account_name, account_kind, origin_id
    from {{ ref('fiscal_expenditure_detail') }}
)
select sha256(to_json([jurisdiction_code, fiscal_year::varchar, document_kind, account_name, origin_id])) as coverage_id,
    jurisdiction_code, fiscal_year, document_kind, account_name, account_kind, origin_id
from rows
