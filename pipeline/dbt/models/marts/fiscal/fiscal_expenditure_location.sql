-- 印字の位置: 科目の表・内訳の表の1行が印字された出典の頁と枠。検索の行を軽くするため木の表から外した。
-- 座標は PDF だけ。複数の印字を足した金額（ADR 0030）の金額の位置は NULL。
select r.row_id,
    r.origin_id,
    r.source_page,
    r.source_x0,
    r.source_y0,
    r.source_x1,
    r.source_y1,
    r.amount_source_page,
    r.amount_source_x0,
    r.amount_source_y0,
    r.amount_source_x1,
    r.amount_source_y1
from {{ ref('int_fiscal__expenditure_rows') }} r
where r.row_id in (select subject_id from {{ ref('fiscal_expenditure_subject') }})
   or r.row_id in (select detail_id from {{ ref('fiscal_expenditure_detail') }})
