-- 1つの資料に同じ自治体は1行（population_id の一意と同じことを、列の組で確かめる）。総数は男女の和以上（性別欄が空欄の外国人住民は総数にだけ入る）で、
-- 男女の和との差は外国人住民の数を超えないほど小さい。大きく離れたら列の読み違いを疑う。
select origin_id, jurisdiction_code
from {{ ref('population') }}
group by origin_id, jurisdiction_code
having count(*) > 1
    or any_value(population) < any_value(male) + any_value(female)
    or any_value(population) - any_value(male) - any_value(female) > any_value(population) * 0.01
