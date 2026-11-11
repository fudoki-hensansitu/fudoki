-- Queria に配る内訳の表（科目の下の事業・節・その他）
select detail_id, parent_detail_id, subject_id, expenditure_id, jurisdiction_code as local_government_code, fiscal_year,
    document_kind, amendment_number, amount_phase, account_name, account_kind,
    kan_code, kan_name, kou_code, kou_name, moku_code, moku_name,
    breakdown, source_heading, node_kind, depth, code, name, department, amount_yen, is_leaf, is_subject_remainder,
    expenditure_setsu_id, is_interfund_transfer, interfund_transfer_to, origin_id
from {{ ref('expenditure_detail') }}
