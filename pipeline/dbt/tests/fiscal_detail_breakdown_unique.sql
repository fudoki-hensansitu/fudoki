-- 分け方の宣言は出典・見出しごとに1行。重複すると枝の根が複製され、内訳の和が倍になる。
select jurisdiction_code, fiscal_year, document_kind, source_heading, count(*) as n
from {{ ref('fiscal_detail_breakdown') }}
group by all
having count(*) > 1
