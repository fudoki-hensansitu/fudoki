-- 歳入の木のノードを、科目の表（款・項・目）と内訳の表（科目の下の節）に振り分ける準備。
-- 科目は科目の軸（is_subject）かつ段が款・項・目のノード。科目の直下の枝の根から子孫へ、その科目と深さを継ぐ。
-- 歳入の節は収入の種類を分ける区分で、歳出の節マスタ・COFOG・繰出の印・事業は持たない（docs/prd/fiscal-revenue/dd.md）。
-- 行の ID は資料区分・補正号・node_id から作る（歳出の int_fiscal__expenditure_rows と同じ）。
with recursive nodes as (
    select n.*,
        o.amendment_number,
        n.is_subject and n.node_kind in ('款', '項', '目') as is_subject_row,
        sha256(to_json([n.document_kind, o.amendment_number::varchar, n.node_id])) as row_id
    from {{ ref('int_fiscal__nodes') }} n
    left join {{ source('fiscal_metadata', 'origin') }} o using (origin_id)
    where n.direction = 'revenue'
), roots as (
    select c.node_id, c.document_kind, p.row_id as subject_row_id
    from nodes c
    join nodes p on p.node_id = c.parent_node_id and p.document_kind = c.document_kind and p.is_subject_row
    where not c.is_subject_row
), branch(node_id, document_kind, subject_row_id, depth) as (
    select node_id, document_kind, subject_row_id, 1 from roots
    union all
    select c.node_id, c.document_kind, b.subject_row_id, b.depth + 1
    from branch b
    join nodes c on c.parent_node_id = b.node_id and c.document_kind = b.document_kind
)
select n.*, b.subject_row_id, b.depth
from nodes n
left join branch b using (node_id, document_kind)
