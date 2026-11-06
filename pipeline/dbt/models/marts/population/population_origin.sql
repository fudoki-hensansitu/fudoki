-- 人口の資料。総務省「住民基本台帳に基づく人口、人口動態及び世帯数」の市区町村別・総計の xlsx 1つが1行。
select origin_id, strftime(reference_date, '%Y-%m-%d') as reference_date, url
from {{ source('population', 'population_origin') }}
