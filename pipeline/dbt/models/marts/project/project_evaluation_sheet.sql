-- 事務事業評価シート。1枚（1小事業）が1行。金額は出典の千円を円にしたもの。
-- 決算書の目・内訳への紐付けと COFOG、新しくできた事業の印は風土記の判断（列の説明を参照）。
with sheet as (
    select s.*, o.jurisdiction_code, o.fiscal_year,
        sha256(to_json([s.origin_id, s.page::varchar])) as sheet_id
    from {{ source('project', 'project_evaluation_sheet') }} s
    join {{ source('project', 'project_origin') }} o using (origin_id)
),
moku as (
    select subject_id, jurisdiction_code, fiscal_year, account_name, kan_name, kou_name, name as moku_name, cofog_code
    from {{ ref('fiscal_expenditure_subject') }}
    where document_kind = 'settlement' and amendment_number is null and level = '目'
),
-- 名前で1つに決まる目だけを採る
subject as (
    select s.sheet_id, any_value(m.subject_id) as subject_id, any_value(m.cofog_code) as cofog_code
    from sheet s
    join moku m on m.jurisdiction_code = s.jurisdiction_code and m.fiscal_year = s.fiscal_year
        and m.account_name = s.account_name and m.kan_name = s.kan and m.kou_name = s.kou and m.moku_name = s.moku
    group by s.sheet_id
    having count(*) = 1
),
detail as (
    select s.sheet_id, any_value(d.detail_id) as detail_id
    from sheet s
    join subject j using (sheet_id)
    -- 内訳の名前は末尾に【所管課】と人数などを印字している
    join {{ ref('fiscal_expenditure_detail') }} d on d.subject_id = j.subject_id and d.breakdown = '事業'
        and regexp_replace(d.name, '【[^】]*】.*$', '') = s.jigyo
    group by s.sheet_id
    having count(*) = 1
),
-- 前の年度までに実績を印字した指標がある
previous_actual as (
    select distinct origin_id, page
    from {{ source('project', 'project_evaluation_indicator_value') }} v
    join {{ source('project', 'project_origin') }} o using (origin_id)
    where v.fiscal_year < o.fiscal_year and nullif(trim(v.actual_text), '') is not null
)
select s.sheet_id, s.origin_id, s.jurisdiction_code, s.fiscal_year, s.page, s.name,
    s.account_name, s.kan as kan_name, s.kou as kou_name, s.moku as moku_name, s.jigyo as jigyo_name,
    s.department, s.division,
    s.budget_thousand * 1000 as budget_yen, s.settled_thousand * 1000 as settled_yen,
    s.cost_previous_thousand * 1000 as cost_previous_yen, s.cost_current_thousand * 1000 as cost_current_yen,
    s.grade_code, s.grade_label, s.direction,
    j.subject_id, d.detail_id,
    coalesce(s.period_start_year = s.fiscal_year and s.cost_previous_thousand = 0 and p.page is null, false) as is_new_project
from sheet s
left join subject j using (sheet_id)
left join detail d using (sheet_id)
left join previous_actual p on p.origin_id = s.origin_id and p.page = s.page
