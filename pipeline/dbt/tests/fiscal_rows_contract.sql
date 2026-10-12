with rows as (select * from {{ ref('int_fiscal__settlement_expenditure_rows') }}),
counts as (select source_table_key, count(*) as n from rows group by 1)
select t.source_table_key, 'missing_or_duplicated_row' as failure
from {{ source('fiscal_metadata', 'tables') }} t left join counts c using (source_table_key)
where coalesce(c.n, 0) <> t.nodes_row_count
union all
select source_table_key, 'invalid_node' from rows
where node_kind is null or name is null or name = '' or axis_header is null or axis_header = ''
   or (parent_node_key is null and (node_kind <> '款' or axis_header <> subject_axis))
   or (axis_header = subject_axis and (node_kind not in ('款','項','目')
       or (code_text is null and node_kind in ('款', '項'))))
union all
-- node_id joins the key so numberless 目 (parent-based identity) never lump with their 項.
select min(source_table_key), 'cross_table_subject_disagreement' from rows
where axis_header = subject_axis and node_kind in ('款', '項', '目')
group by jurisdiction_code, fiscal_year, document_kind, account_name, kan_code, kou_code, moku_code, node_id
having count(distinct name) <> 1 or count(distinct amount_yen) > 1
    or (count(amount_yen) > 0 and count(amount_yen) <> count(*))
    or count(distinct parent_node_id) > 1
union all
select min(source_table_key), 'non_subject_id_collision' from rows
where axis_header <> subject_axis group by document_kind, node_id having count(*) > 1
