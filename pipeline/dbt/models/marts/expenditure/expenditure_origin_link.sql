-- 歳出の根と出典（冊）を結ぶ。1冊が複数の会計にまたがり、1つの会計が分冊になることもある。
select distinct sha256(to_json([expenditure_id, origin_id])) as link_id, expenditure_id, origin_id
from (
    select expenditure_id, origin_id from {{ ref('expenditure_subject') }}
    union
    select expenditure_id, origin_id from {{ ref('expenditure_detail') }}
)
