-- 自治体コードは6桁で、末尾は先頭5桁の検査数字（各桁に6・5・4・3・2を掛けた和を11で割った余りを11から引いた数の1の位）。
-- 5桁で指定された自治体を先頭5桁の一致で引くので、この規則が崩れると別の自治体に当たりうる。
-- OCD ID は都道府県コードを含み、市区町村は自治体コードも含む。都道府県のコードは3〜5桁目が000。
select jurisdiction_code, ocd_id
from {{ ref('jurisdiction_master') }}
where not regexp_full_match(jurisdiction_code, '[0-9]{6}')
    or (11 - (6 * substr(jurisdiction_code, 1, 1)::int + 5 * substr(jurisdiction_code, 2, 1)::int
              + 4 * substr(jurisdiction_code, 3, 1)::int + 3 * substr(jurisdiction_code, 4, 1)::int
              + 2 * substr(jurisdiction_code, 5, 1)::int) % 11) % 10 != substr(jurisdiction_code, 6, 1)::int
    or ocd_id != 'ocd-division/country:jp/prefecture:' || prefecture_code
                  || case when substr(jurisdiction_code, 3, 3) = '000' then '' else '/city:' || jurisdiction_code end
