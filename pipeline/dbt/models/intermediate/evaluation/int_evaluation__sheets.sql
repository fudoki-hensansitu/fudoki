-- 事務事業評価シートの行と ID。1枚に複数の事業を並べる様式は頁の中の順（position）で分け、頁に1件の様式の ID は (出典, 頁) のまま。
select s.*, o.jurisdiction_code, o.fiscal_year,
    sha256(to_json(case when s.position = 1 then [s.origin_id, s.page::varchar]
        else [s.origin_id, s.page::varchar, s.position::varchar] end)) as sheet_id
from {{ source('project', 'project_evaluation_sheet') }} s
join {{ source('project', 'project_origin') }} o using (origin_id)
