-- 歳入の科目の表: 一つの資料の款・項・目。金額は必ず入る（not_null）。
-- 金額は印字の値。出典で空欄の末端（その年度に廃した款・項の 0 の行など）は 0、款・項の金額を印字しない資料の款・項は子の和。
-- 同じ資料の中で末端の行（目と、目の無い項）を足すと総額になり、款の和も総額になる。
-- 自治体・年度・会計は根 revenue に置き、この表には持たない（ADR 0047）。
with rows as (select * from {{ ref('int_fiscal__revenue_rows') }}),
subjects as (select * from rows where is_subject_row),
leafs as (
    select s.* replace (case when not exists (
            select 1 from subjects c where c.parent_node_id = s.node_id and c.document_kind = s.document_kind
        ) then coalesce(s.amount_yen, 0) else s.amount_yen end as amount_yen)
    from subjects s
),
kou_filled as (
    select s.* replace (case when s.node_kind = '項' then coalesce(s.amount_yen, (
        select sum(c.amount_yen) from leafs c where c.parent_node_id = s.node_id and c.document_kind = s.document_kind
    ))::bigint else s.amount_yen end as amount_yen)
    from leafs s
),
filled as (
    select s.* replace (coalesce(s.amount_yen, (
        select sum(c.amount_yen) from kou_filled c where c.parent_node_id = s.node_id and c.document_kind = s.document_kind
    ))::bigint as amount_yen)
    from kou_filled s
)
select r.row_id as subject_id,
    r.node_id as node_key,
    p.row_id as parent_subject_id,
    {{ revenue_id('r.') }} as revenue_id,
    r.node_kind as level,
    r.code,
    r.name,
    r.amount_yen,
    r.origin_id
from filled r
left join rows p on p.node_id = r.parent_node_id and p.document_kind = r.document_kind
