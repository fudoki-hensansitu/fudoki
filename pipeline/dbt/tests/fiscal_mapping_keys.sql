select 'amount_map' from {{ ref('fiscal_amount_map') }}
group by coalesce(document_kind, ''), {{ trim_cell('header') }} having count(*) <> 1
union all
select 'amount_phase' from {{ ref('fiscal_amount_map') }}
where phase not in ('proposed', 'approved', 'adjusted', 'adjusted-before-transfer', 'executed')
