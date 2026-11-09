-- 指標の年度ごとの目標と実績。値はシートの表記のまま（文字列）。
select sha256(to_json([v.origin_id, v.page::varchar, v.position::varchar, v.fiscal_year::varchar])) as value_id,
    sha256(to_json([v.origin_id, v.page::varchar, v.position::varchar])) as indicator_id,
    v.fiscal_year, v.target_text, v.actual_text
from {{ source('project', 'project_evaluation_indicator_value') }} v
