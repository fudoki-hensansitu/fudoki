-- 評価シートの指標。シートに印字された順に1つが1行。値はシートの表記のまま（文字列）。
select sha256(to_json([i.origin_id, i.page::varchar, i.position::varchar])) as indicator_id,
    sha256(to_json([i.origin_id, i.page::varchar])) as sheet_id,
    i.position, i.name, i.unit, i.definition, i.final_target_text, i.final_target_year_text
from {{ source('project', 'project_evaluation_indicator') }} i
