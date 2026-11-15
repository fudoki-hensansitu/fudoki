-- 歳入の根と出典（冊）を結ぶ。歳入と歳出は同じ冊に載るので、出典の表は fiscal_origin を共有する。
select distinct sha256(to_json([revenue_id, origin_id])) as link_id, revenue_id, origin_id
from (
    select revenue_id, origin_id from {{ ref('revenue_subject') }}
    union
    select revenue_id, origin_id from {{ ref('revenue_detail') }}
)
