-- 事業の seed（project_line）の行と事業の行（int_project__lines）が1対1で当たる。
-- seed の行が当たらない（取り込みを直して名前が変わった）か、seed に無い事業の行があれば、
-- `bun run --cwd pipeline project:link-projects` を流し直す。
with seed as (
    select jurisdiction_code, fiscal_year, document_kind, account_name, kan_name, kou_name, moku_name, path
    from {{ ref('project_line') }}
),
lines as (
    select jurisdiction_code, fiscal_year, document_kind, account_name, kan_name, kou_name, moku_name, path
    from {{ ref('int_project__lines') }}
)
select 'seed にあって事業の行に無い' as problem, * from (select * from seed except all select * from lines)
union all
select '事業の行にあって seed に無い', * from (select * from lines except all select * from seed)
