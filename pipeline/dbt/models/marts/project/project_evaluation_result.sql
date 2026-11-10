-- 事務事業評価の結果。資料1つ（1回の評価）が1行。
select r.origin_id, o.jurisdiction_code, r.evaluated_year as fiscal_year, r.page, r.evaluated_count,
    r.grade_a, r.grade_b, r.grade_c, r.grade_d,
    s.origin_id as sheets_origin_id
from {{ source('project', 'project_evaluation_result') }} r
join {{ source('project', 'project_origin') }} o using (origin_id)
left join {{ source('project', 'project_origin') }} s
    on s.document_type = 'sheets' and s.jurisdiction_code = o.jurisdiction_code and s.fiscal_year = r.evaluated_year
