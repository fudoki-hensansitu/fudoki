-- 自治体ごとの住民基本台帳人口。自治体マスタに無い自治体（政令市の区・未収録の都道府県外など）は持たない。
-- population_id は D1 の主キー（列1つ）のための中身由来の識別子で、(origin_id, jurisdiction_code) と1対1。
-- reference_date は資料の基準日の写し（API は表を結合しないので、基準日で直接引けるように持つ）。
select r.origin_id || ':' || r.jurisdiction_code as population_id,
    r.origin_id,
    r.jurisdiction_code,
    strftime(o.reference_date, '%Y-%m-%d') as reference_date,
    r.male,
    r.female,
    r.population,
    r.households
from {{ source('population', 'resident_register') }} r
join {{ source('population', 'population_origin') }} o using (origin_id)
join {{ ref('jurisdiction_master') }} j using (jurisdiction_code)
