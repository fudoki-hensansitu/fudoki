-- Queria に配る科目の表（款・項・目）
select subject_id, parent_subject_id, expenditure_id, jurisdiction_code as local_government_code, fiscal_year,
    document_kind, amendment_number, amount_phase, account_name, account_kind, level, code, name,
    kan_code, kan_name, kou_code, kou_name, moku_code, moku_name, amount_yen, is_leaf,
    cofog_status, cofog_code, is_interfund_transfer, interfund_transfer_to, origin_id
from {{ ref('expenditure_subject') }}
