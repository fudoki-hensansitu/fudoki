-- 事業の行（内訳の breakdown が「事業」の行）と、それを資料をまたいで引く鍵。
-- 鍵は自治体・年度・資料区分・会計・款・項・目と、枝の根からの名前の並び（path）。detail_id は名前を含む hash で取り込みを直すと変わるので、
-- 事業の seed（project_line）はこの鍵で行を引く（docs/prd/jurisdiction-page-data/project-domain-model.md の「事業を作る」）。
-- 同じ親の下に同じ名前が複数あるときは、印字の順（出典・頁・上端・行）で2つ目から `#2` のように番号を付ける。
-- 対象は事業を作る自治体（seed の project_jurisdiction）だけ。
with recursive business as (
    select d.detail_id, d.parent_detail_id, d.subject_id, d.name, d.amount_yen,
        e.jurisdiction_code, e.fiscal_year, e.document_kind, e.account_name,
        coalesce(d.kan_name, '') as kan_name, coalesce(d.kou_name, '') as kou_name, coalesce(d.moku_name, '') as moku_name,
        row_number() over (
            partition by coalesce(d.parent_detail_id, d.subject_id), d.name
            order by l.origin_id, l.source_page, l.source_y0, l.source_line, d.detail_id
        ) as ordinal
    from {{ ref('expenditure_detail') }} d
    join {{ ref('expenditure') }} e using (expenditure_id)
    left join (
        select row_id, min(origin_id) as origin_id, min(source_page) as source_page, min(source_y0) as source_y0, min(source_line) as source_line
        from {{ ref('expenditure_location') }} group by row_id
    ) l on l.row_id = d.detail_id
    where d.breakdown = '事業' and e.amendment_number is null
        and e.jurisdiction_code in (select jurisdiction_code from {{ ref('project_jurisdiction') }})
),
labeled as (
    select *, name || case when ordinal > 1 then '#' || ordinal else '' end as label from business
),
paths as (
    select detail_id, [label] as path from labeled where parent_detail_id is null
    union all
    select c.detail_id, list_append(p.path, c.label)
    from labeled c join paths p on c.parent_detail_id = p.detail_id
)
select l.detail_id, l.parent_detail_id, l.jurisdiction_code, l.fiscal_year, l.document_kind, l.account_name,
    l.kan_name, l.kou_name, l.moku_name, to_json(p.path)::varchar as path, len(p.path) as depth, l.name, l.amount_yen
from labeled l
join paths p using (detail_id)
