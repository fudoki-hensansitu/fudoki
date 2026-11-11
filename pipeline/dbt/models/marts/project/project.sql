-- 事業。予算書・決算書の事業の行を年度をまたいでつないだもの（つなぎ方は風土記の判断。seed の project_line）。
-- 始めた年度・終えた年度は、その自治体・会計の収録の年度で決まる。親の事業は、最新の年度の行の1つ上の事業の行の事業。
with years as (
    select * from {{ ref('project_year') }}
),
coverage as (
    -- 自治体・会計ごとの、事業の行がある年度
    select distinct jurisdiction_code, account_name, fiscal_year from {{ ref('int_project__lines') }}
),
bounds as (
    select jurisdiction_code, account_name, max(fiscal_year) as last_covered
    from coverage group by all
),
latest as (
    select * from years qualify row_number() over (partition by project_id order by fiscal_year desc) = 1
),
spans as (
    select project_id, min(fiscal_year) as first_year, max(fiscal_year) as last_year from years group by project_id
),
parents as (
    -- 最新の年度の行の親の行が属する事業
    select l.project_id, any_value(py.project_id) as parent_project_id
    from latest l
    join {{ ref('int_project__lines') }} line on line.detail_id = coalesce(l.initial_expenditure_detail_id, l.settlement_expenditure_detail_id)
    join years py on line.parent_detail_id in (py.initial_expenditure_detail_id, py.settlement_expenditure_detail_id)
    group by l.project_id
)
select l.project_id, l.jurisdiction_code, l.name, l.account_name,
    s.first_year,
    case
        when exists (select 1 from coverage c where c.jurisdiction_code = l.jurisdiction_code
            and c.account_name = l.account_name and c.fiscal_year = s.first_year - 1) then 'confirmed'
        else 'before_coverage'
    end as first_year_kind,
    case when s.last_year = b.last_covered then null else s.last_year end as last_year,
    case
        when s.last_year = b.last_covered then 'latest'
        when exists (select 1 from coverage c where c.jurisdiction_code = l.jurisdiction_code
            and c.account_name = l.account_name and c.fiscal_year = s.last_year + 1) then 'confirmed'
        else 'unknown'
    end as last_year_kind,
    p.parent_project_id
from latest l
join spans s using (project_id)
join bounds b using (jurisdiction_code, account_name)
left join parents p using (project_id)
