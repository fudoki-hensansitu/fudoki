-- 自治体マスタの自治体は、どの資料にも1行ある。資料が途中で欠けると、その基準日の人口が黙って抜けるので止める。
select o.origin_id, m.jurisdiction_code
from {{ ref('population_origin') }} o
cross join {{ ref('jurisdiction_master') }} m
left join {{ ref('jurisdiction_population') }} p
    on p.origin_id = o.origin_id and p.jurisdiction_code = m.jurisdiction_code
where p.population_id is null
