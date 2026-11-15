-- Queria に配る科目の表（款・項・目）。1行で根・款・項・目まで読める平たい形を、ここで JOIN して作る（ADR 0047）
select s.subject_id, s.node_key, s.parent_subject_id, s.expenditure_id, e.jurisdiction_code as local_government_code, e.fiscal_year,
    e.document_kind, e.amendment_number, case e.document_kind when 'settlement' then 'executed' else 'approved' end as amount_phase,
    e.account_name, e.account_kind, s.level, s.code, s.name,
    sp.kan_code, sp.kan_name, sp.kou_code, sp.kou_name, sp.moku_code, sp.moku_name, s.amount_yen, sp.is_leaf,
    s.cofog_status, s.cofog_code, s.is_interfund_transfer, s.interfund_transfer_to, s.origin_id
from {{ ref('expenditure_subject') }} s
join {{ ref('expenditure') }} e using (expenditure_id)
join {{ ref('int_fiscal__subject_path') }} sp using (subject_id)
