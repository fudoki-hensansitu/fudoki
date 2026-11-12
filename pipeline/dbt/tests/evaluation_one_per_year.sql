-- 事業評価は自治体の1年度に1つ。評価結果の資料は1年度に1つとして結んでいる（評価シートは部署ごとの分冊があるので1年度に複数ある）。
select jurisdiction_code, fiscal_year, document_type, count(*) as n
from {{ ref('evaluation_origin') }}
where document_type = 'result'
group by 1, 2, 3
having count(*) > 1
