-- 科目の表: 一つの資料の款・項・目。金額は印字の値（当初予算の CSV の親は子の和）。
-- 同じ資料の中で is_leaf の行（目と、目の無い項）を足すと総額になる。
with rows as (select * from {{ ref('int_fiscal__expenditure_rows') }})
select r.row_id as subject_id,
    r.node_id as node_key,
    p.row_id as parent_subject_id,
    {{ expenditure_id('r.') }} as expenditure_id,
    r.jurisdiction_code,
    r.fiscal_year,
    r.document_kind,
    r.amendment_number,
    r.amount_phase,
    r.account_name,
    r.account_kind,
    r.node_kind as level,
    r.code,
    r.name,
    r.kan_code,
    r.kan_name,
    r.kou_code,
    r.kou_name,
    r.moku_code,
    case when r.node_kind = '目' then r.name end as moku_name,
    r.amount_yen,
    not exists (
        select 1 from rows c
        where c.parent_node_id = r.node_id and c.document_kind = r.document_kind and c.is_subject_row
    ) as is_leaf,
    r.cofog_status,
    r.cofog_code,
    r.is_interfund_transfer,
    r.interfund_transfer_to,
    r.origin_id
from rows r
left join rows p on p.node_id = r.parent_node_id and p.document_kind = r.document_kind
where r.is_subject_row
    -- A 款・項 the year dropped prints no number and no budget beside last year's (`(共同事業拠出金)`):
    -- the year has nothing under it, so the table leaves it out.
    and not (r.kan_code is null and coalesce(r.amount_yen, 0) = 0)
