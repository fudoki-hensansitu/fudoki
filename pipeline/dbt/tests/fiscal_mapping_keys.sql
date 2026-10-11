select 'level_map' as failure from {{ ref('fiscal_level_map') }}
group by jurisdiction_code, table_id, axis_header, depth having count(*) <> 1
union all
select 'amount_map' from {{ ref('fiscal_amount_map') }}
group by coalesce(document_kind, ''), {{ trim_cell('header') }} having count(*) <> 1
union all
select 'amount_phase' from {{ ref('fiscal_amount_map') }}
where phase not in ('proposed', 'approved', 'adjusted', 'adjusted-before-transfer', 'executed')
