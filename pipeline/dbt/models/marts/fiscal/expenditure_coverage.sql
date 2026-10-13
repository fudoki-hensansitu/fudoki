-- 収録範囲: 歳出の木に明細がある団体・年度・資料区分・会計と、その明細が指す原典。
-- 原典の選定結果は使わない（選定しても木に明細が無ければ検索で返らない）。
with nodes as (
    select jurisdiction_code, fiscal_year, 'settlement' as document_kind, account_name, account_kind, origin_id
    from {{ ref('settlement_expenditure_node') }}
    union
    select jurisdiction_code, fiscal_year, 'initial' as document_kind, account_name, account_kind, origin_id
    from {{ ref('initial_expenditure_node') }}
)
select sha256(to_json([jurisdiction_code, fiscal_year::varchar, document_kind, account_name, origin_id])) as coverage_id,
    jurisdiction_code, fiscal_year, document_kind, account_name, account_kind, origin_id
from nodes
