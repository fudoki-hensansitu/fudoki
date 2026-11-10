-- 内訳の表: 科目の下の項目。枝の根（科目の直下）の見出しに出典ごとの宣言で分け方を付け、子孫へ継ぐ。
-- 宣言が「除外」の枝と、宣言の無い枝（検査 fiscal_detail_breakdown_declared が止める）は入れない。
-- 同じ科目・同じ分け方で depth = 1 の行を足すと、その科目の額になる（出典の金額が欠ける行を除く）。
with rows as (select * from {{ ref('int_fiscal__expenditure_rows') }}),
subjects as (select * from {{ ref('expenditure_subject') }})
select r.row_id as detail_id,
    r.node_id as node_key,
    case when r.depth > 1 then p.row_id end as parent_detail_id,
    r.subject_row_id as subject_id,
    {{ expenditure_id('r.') }} as expenditure_id,
    r.jurisdiction_code,
    r.fiscal_year,
    r.document_kind,
    r.amendment_number,
    r.amount_phase,
    r.account_name,
    r.account_kind,
    s.kan_code,
    s.kan_name,
    s.kou_code,
    s.kou_name,
    s.moku_code,
    s.moku_name,
    r.breakdown,
    r.source_heading,
    r.node_kind,
    r.depth,
    r.code,
    r.name,
    nullif(trim(regexp_extract(r.name, '【([^】]+)】\s*$', 1)), '') as department,
    r.amount_yen,
    r.is_leaf,
    r.depth = 1 and not s.is_leaf as is_subject_remainder,
    r.expenditure_setsu_id,
    r.is_interfund_transfer,
    r.interfund_transfer_to,
    r.origin_id
from rows r
join subjects s on s.subject_id = r.subject_row_id
left join rows p on p.node_id = r.parent_node_id and p.document_kind = r.document_kind
where not r.is_subject_row and r.breakdown in ('事業', '節', 'その他')
