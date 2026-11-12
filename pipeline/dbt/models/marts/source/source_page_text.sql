-- アシスタントが読む出典の頁の文字（事業評価・予算案のプレス発表）。頁1つが1行。
-- 文字が1字も無い出典（スキャン）は行が無い。本文は api が返す上限（12,000字）で切る。
with origin as (
    select sha256, min(jurisdiction_code) as jurisdiction_code
    from (
        select sha256, jurisdiction_code from {{ ref('evaluation_origin') }}
        union all
        select sha256, jurisdiction_code from {{ ref('budget_proposal_origin') }}
    )
    group by sha256
)
select sha256(to_json(['source_page', t.sha256, t.page::varchar])) as page_id,
    o.jurisdiction_code, t.sha256, t.page,
    left(t.text, 12000) as text,
    length(t.text) > 12000 as truncated
from {{ source('project', 'project_source_page_text') }} t
join origin o using (sha256)
