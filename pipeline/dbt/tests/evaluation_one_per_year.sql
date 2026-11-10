-- 事業評価は自治体の1年度に1つ。評価結果の資料と評価シートの資料も1年度に1つずつとして結んでいる。
select jurisdiction_code, fiscal_year, document_type, count(*) as n
from {{ ref('evaluation_origin') }}
group by 1, 2, 3
having count(*) > 1
