-- Check every printed amount, including columns excluded from execution totals.
select a.source_table_key, a.node_key, a.header_path, a.unit_text
from {{ ref('stg_fiscal__amounts') }} a
join {{ ref('stg_fiscal__nodes') }} n using (source_table_key, node_key)
where a.unit_text is null or a.unit_text not in ('円', '千円')
   or not (
       exists (
           select 1 from {{ ref('fiscal_amount_map') }} m
           where coalesce(m.document_kind, '') in ('', 'settlement')
             and {{ trim_cell('m.header') }} in (a.header_path, split_part(a.header_path, '/', -1))
       )
       or (n.level_header is not null and starts_with(a.header_path, n.axis_header || '/')
           and split_part(a.header_path, '/', -1) = n.level_header
           and exists (
               select 1 from {{ ref('fiscal_amount_map') }} m
               where coalesce(m.document_kind, '') in ('', 'settlement')
                 and {{ trim_cell('m.header') }} = n.axis_header
           ))
   )
