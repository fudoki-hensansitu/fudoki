-- 歳入の内訳の表: 科目の下の節（とその下の印字）。同じ科目の depth = 1 の行を足すと、その科目の額になる
-- （出典の金額が欠ける行を除く）。根の値・所属する款・項・目は持たない（ADR 0047）。
with rows as (select * from {{ ref('int_fiscal__revenue_rows') }}),
subjects as (select * from {{ ref('revenue_subject') }})
select r.row_id as detail_id,
    r.node_id as node_key,
    case when r.depth > 1 then p.row_id end as parent_detail_id,
    r.subject_row_id as subject_id,
    {{ revenue_id('r.') }} as revenue_id,
    r.axis as source_heading,
    r.node_kind,
    r.depth,
    r.code,
    r.name,
    r.amount_yen,
    r.origin_id
from rows r
join subjects s on s.subject_id = r.subject_row_id
left join rows p on p.node_id = r.parent_node_id and p.document_kind = r.document_kind
where not r.is_subject_row
