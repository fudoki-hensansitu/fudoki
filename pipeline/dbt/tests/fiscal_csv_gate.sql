-- Save gate for raw CSV trees, as for PDF tables: the declared amount column must be
-- the phase of its document kind (settlement: executed, initial: approved), the tree
-- needs a 款 axis, and more than half of the 目 carry an amount.
with declared as (
    select t.source_table_key, t.document_kind,
        regexp_replace(t.amount_column, '^[0-9]+', '') as header
    from {{ source('fiscal_metadata', 'csv_tables') }} t
    where t.direction = 'expenditure'
), phase_mismatch as (
    select d.source_table_key, 'amount_column_phase' as failure
    from declared d
    left join {{ ref('fiscal_amount_map') }} m
      on coalesce(m.document_kind, '') in ('', d.document_kind) and {{ trim_cell('m.header') }} = {{ trim_cell('d.header') }}
    qualify row_number() over (partition by d.source_table_key order by m.document_kind desc nulls last) = 1
       and coalesce(m.phase, '') <> case d.document_kind when 'settlement' then 'executed' when 'initial' then 'approved' else '' end
), shape as (
    select t.source_table_key,
        count(*) filter (where n.node_kind = '款') as kan,
        count(*) filter (where n.node_kind = '目' and n.is_subject) as moku,
        count(*) filter (where n.node_kind = '目' and n.is_subject and n.amount_yen is not null) as moku_with_amount
    from {{ source('fiscal_metadata', 'csv_tables') }} t
    join {{ ref('int_fiscal__csv_expenditure_nodes') }} n on n.origin_id = t.origin_id
        and n.jurisdiction_code = t.jurisdiction_code and n.fiscal_year = t.fiscal_year and n.document_kind = t.document_kind
    where t.direction = 'expenditure'
    group by 1
)
select * from phase_mismatch
union all
select source_table_key, 'no_subject_axis' from shape where kan = 0
union all
select source_table_key, 'amount_on_minority_of_moku' from shape where moku_with_amount * 2 <= moku
