-- 内訳の枝の根（科目の直下）の見出しには、出典（自治体・年度・資料区分）ごとの分け方の宣言が要る。
-- 宣言の無い枝は内訳の表に入らないので、新しい出典・見出しが黙って落ちないよう止める。
-- 宣言の書き方は seed fiscal_detail_breakdown の説明と .agents/skills/pipeline/ を見る。
select distinct jurisdiction_code, fiscal_year, document_kind, source_heading, 'undeclared_heading' as failure
from {{ ref('int_fiscal__expenditure_rows') }}
where not is_subject_row and depth = 1 and breakdown is null
union all
select distinct b.jurisdiction_code, b.fiscal_year, b.document_kind, b.source_heading, 'unused_declaration'
from {{ ref('fiscal_detail_breakdown') }} b
where not exists (
    select 1 from {{ ref('int_fiscal__expenditure_rows') }} r
    where r.depth = 1 and r.jurisdiction_code = b.jurisdiction_code and r.fiscal_year = b.fiscal_year
      and r.document_kind = b.document_kind and r.source_heading = b.source_heading)
