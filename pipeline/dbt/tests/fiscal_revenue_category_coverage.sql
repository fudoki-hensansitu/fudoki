-- 市区町村の一般会計の歳入の款は、区分の辞書（seed fiscal_revenue_category）のどれかに当たる。
-- 辞書に無い款の名前は黙って「その他」にせず build を止め、辞書の行を足す（表記の揺れも行で吸収し、似た名前で寄せない）。
-- 都道府県（自治体コードの末尾4桁が 0000）と特別会計は区分を使わないので見ない。
select distinct r.jurisdiction_code, r.fiscal_year, s.name as kan_name
from {{ ref('revenue_subject') }} s
join {{ ref('revenue') }} r using (revenue_id)
left join {{ ref('fiscal_revenue_category') }} c on c.kan_name = s.name
where s.level = '款' and r.account_kind = '一般会計' and right(r.jurisdiction_code, 4) <> '0000'
  and c.kan_name is null
