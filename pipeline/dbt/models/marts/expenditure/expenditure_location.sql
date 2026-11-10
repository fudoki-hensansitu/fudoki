-- 印字の位置: 科目の表・内訳の表の1行が印字された出典の位置。出典の形式で形が違う（kind）。
-- pdf は頁と枠（pt、頁の左上が原点）、csv は行番号。複数の印字を足した金額（ADR 0030）の金額の位置は NULL。
with r as (
    select r.*, o.format
    from {{ ref('int_fiscal__expenditure_rows') }} r
    join {{ ref('expenditure_origin') }} o using (origin_id)
    where r.row_id in (select subject_id from {{ ref('expenditure_subject') }})
       or r.row_id in (select detail_id from {{ ref('expenditure_detail') }})
)
select row_id,
    origin_id,
    case when format = 'csv' then 'csv' else 'pdf' end as kind,
    case when format <> 'csv' then source_page end as source_page,
    case when format <> 'csv' then source_x0 end as source_x0,
    case when format <> 'csv' then source_y0 end as source_y0,
    case when format <> 'csv' then source_x1 end as source_x1,
    case when format <> 'csv' then source_y1 end as source_y1,
    case when format <> 'csv' then amount_source_page end as amount_source_page,
    case when format <> 'csv' then amount_source_x0 end as amount_source_x0,
    case when format <> 'csv' then amount_source_y0 end as amount_source_y0,
    case when format <> 'csv' then amount_source_x1 end as amount_source_x1,
    case when format <> 'csv' then amount_source_y1 end as amount_source_y1,
    case when format = 'csv' then source_page end as source_line,
    case when format = 'csv' then amount_source_page end as amount_source_line
from r
