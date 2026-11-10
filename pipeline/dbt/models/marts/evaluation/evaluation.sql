-- 事業評価の根: 自治体の1年度（評価した事業を行った年度）分の事務事業評価。評価シートか評価結果の資料のどちらかがある年度が1行。
-- 評価結果の資料がある年度は kind = with_result で件数を持ち、シートだけの年度は sheets_only で件数は空。
with years as (
    select distinct jurisdiction_code, fiscal_year
    from {{ source('project', 'project_origin') }}
    where document_type in ('sheets', 'result')
),
result as (
    select o.jurisdiction_code, r.evaluated_year as fiscal_year, r.origin_id, r.page, r.evaluated_count,
        r.grade_a, r.grade_b, r.grade_c, r.grade_d
    from {{ source('project', 'project_evaluation_result') }} r
    join {{ source('project', 'project_origin') }} o using (origin_id)
)
select sha256(to_json(['evaluation', y.jurisdiction_code, y.fiscal_year::varchar])) as evaluation_id,
    y.jurisdiction_code, y.fiscal_year,
    case when r.origin_id is null then 'sheets_only' else 'with_result' end as kind,
    r.origin_id as result_origin_id, r.page as result_page, r.evaluated_count,
    r.grade_a, r.grade_b, r.grade_c, r.grade_d
from years y
left join result r using (jurisdiction_code, fiscal_year)
