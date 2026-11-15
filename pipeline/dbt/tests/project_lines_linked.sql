-- 事業の行（int_project__lines）はどれもちょうど1つの事業ID（int_project__line_ids）を持つ。
-- 行が落ちると int_project__years の結合で事業の年度から黙って消えるので、ここで止める。
with lines as (select detail_id from {{ ref('int_project__lines') }}),
ids as (select detail_id, count(*) as n from {{ ref('int_project__line_ids') }} group by detail_id)
select 'ID の無い事業の行' as problem, l.detail_id from lines l left join ids i using (detail_id) where i.detail_id is null
union all
select 'ID が2つ以上ある事業の行', detail_id from ids where n > 1
union all
select '事業の行に無い ID', i.detail_id from ids i left join lines l using (detail_id) where l.detail_id is null
