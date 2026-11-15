-- 事業の一覧の資料（予算書に事業名の無い自治体で、事業を作る資料）の行。
-- 科目は、同じ年度の当初予算の科目の表へ、会計と、一覧に印字された科目（目・項・款）の名前で当てる（風土記の判断）。
-- 下の段から当て、当たらなければ1つ上の段で当てる（北区の「小・中学校費」は予算書の小学校費・中学校費をまとめた項なので、款の教育費に当たる）。
-- 名前は空白を除いて比べる。同じ段に同じ名前の科目が2つ以上あれば、その段では当てない。一覧に科目が無い（港区）か、どの段も当たらなければ空にする。
with lines as (
    select sha256(to_json(['project_list_line', l.origin_id, l.page::varchar, l.position::varchar])) as list_line_id,
        l.origin_id, l.page, l.position, o.jurisdiction_code, o.fiscal_year, l.account_name,
        l.kan, l.kou, l.moku, l.name, l.department, l.budget_yen, l.is_new,
        [{'level': '目', 'name': l.moku, 'depth': 3}, {'level': '項', 'name': l.kou, 'depth': 2}, {'level': '款', 'name': l.kan, 'depth': 1}] as levels
    from {{ source('project', 'project_list_line') }} l
    join {{ source('project', 'project_list_origin') }} o using (origin_id)
),
subjects as (
    select s.subject_id, s.jurisdiction_code, s.fiscal_year, s.account_name, s.level, s.name
    from {{ ref('expenditure_subject') }} s
    where s.document_kind = 'initial'
),
wanted as (
    select l.list_line_id, l.jurisdiction_code, l.fiscal_year, l.account_name, u.v.level as level, u.v.name as name, u.v.depth as depth
    from lines l, unnest(l.levels) as u(v)
    where u.v.name is not null
),
matched as (
    select w.list_line_id, w.depth, s.subject_id, count(*) over (partition by w.list_line_id, w.depth) as candidates
    from wanted w
    join subjects s
        on s.jurisdiction_code = w.jurisdiction_code and s.fiscal_year = w.fiscal_year and s.level = w.level
        and {{ fiscal_match_text('s.account_name') }} = {{ fiscal_match_text('w.account_name') }}
        and {{ fiscal_match_text('s.name') }} = {{ fiscal_match_text('w.name') }}
),
best as (
    select list_line_id, arg_max(subject_id, depth) as subject_id
    from matched where candidates = 1
    group by list_line_id
)
select l.list_line_id, l.origin_id, l.page, l.position, l.jurisdiction_code, l.fiscal_year, l.account_name,
    l.kan, l.kou, l.moku, l.name, l.department, l.budget_yen, l.is_new,
    b.subject_id
from lines l
left join best b using (list_line_id)
