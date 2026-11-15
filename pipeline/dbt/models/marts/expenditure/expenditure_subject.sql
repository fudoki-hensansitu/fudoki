-- 科目の表: 一つの資料の款・項・目。金額は必ず入る（not_null）。
-- 金額は印字の値。出典で空欄の末端（決算で支出の無い予備費、その年度に廃した目の括弧書き `(図書館費)` など）は 0。
-- 款・項の金額を印字しない資料（予算書の事項別明細書が款・項を頁の見出しだけに書くもの）と当初予算 CSV の親は子の和。
-- 同じ資料の中で末端の行（目と、目の無い項）を足すと総額になり、款の和も総額になる。
-- 自治体・年度・会計は根 expenditure に、所属する款・項・目と子の有無は int_fiscal__subject_path に置き、この表には持たない（ADR 0047）。
with rows as (select * from {{ ref('int_fiscal__expenditure_rows') }}),
subjects as (
    select * from rows r
    where r.is_subject_row
        -- A 款・項 the year dropped prints no number and no budget beside last year's (`(共同事業拠出金)`):
        -- the year has nothing under it, so the table leaves it out.
        and not (r.kan_code is null and coalesce(r.amount_yen, 0) = 0)
),
leafs as (
    select s.* replace (case when not exists (
            select 1 from subjects c where c.parent_node_id = s.node_id and c.document_kind = s.document_kind
        ) then coalesce(s.amount_yen, 0) else s.amount_yen end as amount_yen)
    from subjects s
),
-- 印字の無い項は子（目）の和。款は項を埋めた後で子（項と、項に属さない目）の和
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
    {{ expenditure_id('r.') }} as expenditure_id,
    r.node_kind as level,
    r.code,
    r.name,
    r.amount_yen,
    r.cofog_status,
    r.cofog_code,
    r.is_interfund_transfer,
    r.interfund_transfer_to,
    r.origin_id
from filled r
left join rows p on p.node_id = r.parent_node_id and p.document_kind = r.document_kind
