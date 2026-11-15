-- 科目の表: 一つの資料の款・項・目。金額は印字の値（当初予算の CSV の親は子の和）。
-- 款・項の金額を印字しない資料（予算書の事項別明細書が款・項を頁の見出しだけに書くもの）では、
-- 子の金額がすべてある款・項に子の和を入れる。子に金額の欠けがあれば NULL のまま。
-- 番号も金額も無い子（その年度に廃した目を前年度の額だけ括弧書きで載せたもの `(図書館費)`）はその年度の額が無いので数えない。
-- 同じ資料の中で is_leaf の行（目と、目の無い項）を足すと総額になり、款の和も総額になる。
with rows as (select * from {{ ref('int_fiscal__expenditure_rows') }}),
subjects as (
    select * from rows r
    where r.is_subject_row
        -- A 款・項 the year dropped prints no number and no budget beside last year's (`(共同事業拠出金)`):
        -- the year has nothing under it, so the table leaves it out.
        and not (r.kan_code is null and coalesce(r.amount_yen, 0) = 0)
),
-- 印字の無い項は子（目）の和。款は項を埋めた後で子（項と、項に属さない目）の和
dropped as (
    select row_id from subjects where code is null and amount_yen is null
),
kou_sum as (
    select p.row_id, sum(c.amount_yen)::bigint as amount_yen
    from subjects p
    join subjects c on c.parent_node_id = p.node_id and c.document_kind = p.document_kind
        and c.row_id not in (select row_id from dropped)
    where p.node_kind = '項' and p.amount_yen is null
    group by p.row_id
    having count(c.amount_yen) = count(*)
),
kou_filled as (
    select s.* replace (coalesce(s.amount_yen, k.amount_yen) as amount_yen)
    from subjects s left join kou_sum k using (row_id)
),
kan_sum as (
    select p.row_id, sum(c.amount_yen)::bigint as amount_yen
    from kou_filled p
    join kou_filled c on c.parent_node_id = p.node_id and c.document_kind = p.document_kind
        and c.row_id not in (select row_id from dropped)
    where p.node_kind = '款' and p.amount_yen is null
    group by p.row_id
    having count(c.amount_yen) = count(*)
),
filled as (
    select s.* replace (coalesce(s.amount_yen, k.amount_yen) as amount_yen)
    from kou_filled s left join kan_sum k using (row_id)
)
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
        select 1 from subjects c
        where c.parent_node_id = r.node_id and c.document_kind = r.document_kind
    ) as is_leaf,
    r.cofog_status,
    r.cofog_code,
    r.is_interfund_transfer,
    r.interfund_transfer_to,
    r.origin_id
from filled r
left join rows p on p.node_id = r.parent_node_id and p.document_kind = r.document_kind
