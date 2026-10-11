with node_counts as (
    select source_table_key, count(*) as n from {{ ref('stg_fiscal__nodes') }} group by 1
), amount_counts as (
    select source_table_key, count(*) as n from {{ ref('stg_fiscal__amounts') }} group by 1
)
select t.source_table_key, 'row_count' as failure
from {{ source('fiscal_metadata', 'tables') }} t
left join node_counts n using (source_table_key) left join amount_counts a using (source_table_key)
where coalesce(n.n, 0) <> t.nodes_row_count or coalesce(a.n, 0) <> t.amounts_row_count
union all
select source_table_key, 'duplicate_node' from {{ ref('stg_fiscal__nodes') }}
group by source_table_key, node_key having count(*) <> 1
union all
select n.source_table_key, 'missing_parent' from {{ ref('stg_fiscal__nodes') }} n
left join {{ ref('stg_fiscal__nodes') }} p
  on n.source_table_key = p.source_table_key and n.parent_node_key = p.node_key
where n.parent_node_key is not null and p.node_key is null
union all
select a.source_table_key, 'missing_amount_owner_or_header_unit' from {{ ref('stg_fiscal__amounts') }} a
left join {{ ref('stg_fiscal__nodes') }} n using (source_table_key, node_key)
where n.node_key is null or a.header_path is null or a.header_path = ''
   or a.unit_text is null or a.unit_text not in ('円', '千円') or a.amount is null
union all
select source_table_key, 'duplicate_amount_header' from {{ ref('stg_fiscal__amounts') }}
group by source_table_key, node_key, header_path having count(*) <> 1
