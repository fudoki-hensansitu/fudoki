-- 団体マスタ（ADR 0015）。名称・OCD ID は packages/jurisdictions/jurisdictions.json が正本で、
-- 都道府県はマスタに無いので団体コードの先頭2桁から引く。
select j.jurisdiction_code,
    j.name,
    p.prefecture_code,
    p.prefecture_name,
    j.ocd_id
from {{ source('registry', 'jurisdiction') }} j
left join {{ ref('prefecture_master') }} p on p.prefecture_code = substr(j.jurisdiction_code, 1, 2)
