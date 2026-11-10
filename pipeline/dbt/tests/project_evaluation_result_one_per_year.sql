-- 事業評価は自治体の1年度に1つ。評価シートの資料も1年度に1つとして結んでいる。
select jurisdiction_code, fiscal_year, count(*) as n
from {{ ref('project_evaluation_result') }}
group by 1, 2
having count(*) > 1
union all
select jurisdiction_code, fiscal_year, count(*)
from {{ ref('project_origin') }}
where document_type = 'sheets'
group by 1, 2
having count(*) > 1
