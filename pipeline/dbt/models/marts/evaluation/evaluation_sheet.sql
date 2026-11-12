-- 事務事業評価シート。1枚（1事業）が1行。金額は出典の印字を円にしたもの。
-- 決算書の目・内訳への紐付けは風土記の判断（列の説明を参照）。
with recursive sheet as (
    select s.*, o.jurisdiction_code, o.fiscal_year,
        sha256(to_json([s.origin_id, s.page::varchar])) as sheet_id
    from {{ source('project', 'project_evaluation_sheet') }} s
    join {{ source('project', 'project_origin') }} o using (origin_id)
),
moku as (
    select subject_id, jurisdiction_code, fiscal_year, account_name, kan_name, kou_name, name as moku_name
    from {{ ref('expenditure_subject') }}
    where document_kind = 'settlement' and amendment_number is null and level = '目'
),
-- 名前で1つに決まる目だけを採る
subject as (
    select s.sheet_id, any_value(m.subject_id) as subject_id
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
    join {{ ref('expenditure_detail') }} d on d.subject_id = j.subject_id and d.breakdown = '事業'
        and regexp_replace(d.name, '【[^】]*】.*$', '') = s.jigyo
    group by s.sheet_id
    having count(*) = 1
),
-- 予算科目の事業の子孫に、シートの小事業と同じ名前の事業が1つだけあれば、その事業に付ける
descendant as (
    select d.sheet_id, x.detail_id
    from detail d
    join {{ ref('expenditure_detail') }} x on x.parent_detail_id = d.detail_id and x.breakdown = '事業'
    union all
    select a.sheet_id, x.detail_id
    from descendant a
    join {{ ref('expenditure_detail') }} x on x.parent_detail_id = a.detail_id and x.breakdown = '事業'
),
same_name as (
    select a.sheet_id, any_value(a.detail_id) as detail_id
    from descendant a
    join sheet s using (sheet_id)
    join {{ ref('expenditure_detail') }} x using (detail_id)
    where regexp_replace(x.name, '【[^】]*】.*$', '') = s.name
    group by a.sheet_id
    having count(*) = 1
)
select s.sheet_id, sha256(to_json(['evaluation', s.jurisdiction_code, s.fiscal_year::varchar])) as evaluation_id,
    s.origin_id, s.jurisdiction_code, s.fiscal_year, s.page, s.name,
    s.account_name, s.kan as kan_name, s.kou as kou_name, s.moku as moku_name, s.jigyo as jigyo_name,
    s.department, s.division,
    s.budget_yen, s.settled_yen,
    s.grade_label, s.direction, s.direction_code,
    j.subject_id as expenditure_subject_id, coalesce(p.detail_id, d.detail_id) as expenditure_detail_id
from sheet s
left join subject j using (sheet_id)
left join detail d using (sheet_id)
left join same_name p using (sheet_id)
