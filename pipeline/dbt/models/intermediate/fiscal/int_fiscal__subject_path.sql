-- 科目の表の行ごとの、所属する款・項・目と子の有無。科目の表には持たず（ADR 0047）、使う所でこの model を JOIN する。
-- 款・項・目は自分の段も含む。目が款の直下にある資料があるので、親・祖父母のうち段の合うものを採る。
{{ config(materialized='ephemeral') }}
with s as (select subject_id, parent_subject_id, level, code, name from {{ ref('expenditure_subject') }})
select s.subject_id,
    case when s.level = '款' then s.code when p.level = '款' then p.code else g.code end as kan_code,
    case when s.level = '款' then s.name when p.level = '款' then p.name else g.name end as kan_name,
    case when s.level = '項' then s.code when p.level = '項' then p.code end as kou_code,
    case when s.level = '項' then s.name when p.level = '項' then p.name end as kou_name,
    case when s.level = '目' then s.code end as moku_code,
    case when s.level = '目' then s.name end as moku_name,
    not exists (select 1 from s c where c.parent_subject_id = s.subject_id) as is_leaf
from s
left join s p on p.subject_id = s.parent_subject_id
left join s g on g.subject_id = p.parent_subject_id
