-- 施策の紐付けの seed（budget_measure_link）の行が、取り込みの施策（project_budget_measure）に必ず当たる。
-- 当たらない行は、取り込みを直して施策の頁・位置がずれたもの。紐付けが黙って外れるので、
-- `bun run --cwd pipeline project:link-measures` で紐付け直す。
select l.*
from {{ ref('budget_measure_link') }} l
left join {{ source('project', 'project_budget_measure') }} p
    on p.origin_id = l.origin_id and p.page = l.page and p.position = l.position
where p.origin_id is null
    and {{ only_jurisdictions('l.jurisdiction_code') }}
