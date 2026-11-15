-- Queria に配る内訳の表（科目の下の事業・節・その他）。1行で根・款・項・目まで読める平たい形を、ここで JOIN して作る（ADR 0047）
with d as (select * from {{ ref('expenditure_detail') }})
select d.detail_id, d.node_key, d.parent_detail_id, d.subject_id, d.expenditure_id, e.jurisdiction_code as local_government_code, e.fiscal_year,
    e.document_kind, e.amendment_number, case e.document_kind when 'settlement' then 'executed' else 'approved' end as amount_phase,
    e.account_name, e.account_kind,
    sp.kan_code, sp.kan_name, sp.kou_code, sp.kou_name, sp.moku_code, sp.moku_name,
    d.breakdown, d.source_heading, d.node_kind, d.depth, d.code, d.name, d.department, d.amount_yen,
    not exists (select 1 from d c where c.parent_detail_id = d.detail_id) as is_leaf,
    d.depth = 1 and not sp.is_leaf as is_subject_remainder,
    d.expenditure_setsu_id, d.is_interfund_transfer, d.interfund_transfer_to, d.origin_id
from d
join {{ ref('expenditure') }} e using (expenditure_id)
join {{ ref('int_fiscal__subject_path') }} sp using (subject_id)
