-- Queria に配る歳出の根（serving/queria.py が同名・同列のまま写す）
select expenditure_id, jurisdiction_code as local_government_code, fiscal_year, document_kind, amendment_number,
    account_name, account_kind
from {{ ref('expenditure') }}
