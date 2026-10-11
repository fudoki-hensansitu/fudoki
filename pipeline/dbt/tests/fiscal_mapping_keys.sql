select 'level_map' as failure from {{ ref('fiscal_level_map') }}
group by jurisdiction_code, table_id, axis_header, depth having count(*) <> 1
union all
select 'amount_map' from {{ ref('fiscal_amount_map') }}
group by axis_header, {{ trim_cell('header_path') }} having count(*) <> 1
union all
select 'amount_role' from {{ ref('fiscal_amount_map') }}
where amount_role not in ('executed', 'executed_component', 'other_phase', 'non_executed')
