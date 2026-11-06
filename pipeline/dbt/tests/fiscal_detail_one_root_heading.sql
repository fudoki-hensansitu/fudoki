-- 同じ科目の下で、同じ分け方の枝の根の見出しは一つ。二つあると depth = 1 の和が科目の額の二重になる。
select subject_id, breakdown, count(distinct source_heading) as headings
from {{ ref('fiscal_expenditure_detail') }}
where depth = 1
group by 1, 2
having count(distinct source_heading) > 1
