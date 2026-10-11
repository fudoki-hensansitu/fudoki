-- Keep source rows until cross-table identity and value checks have passed.
-- Level names follow one shared rule (ADR 0022): the axis carrying 款 is the subject axis
-- and its depths 1/2/3 are 款・項・目; any other axis uses its printed level_header,
-- or 内訳{depth} when nothing is printed.
with recursive subject_axes as (
    select source_table_key, min(axis_header) as subject_axis
    from {{ ref('stg_fiscal__nodes') }}
    where level_header = '款'
    group by source_table_key
), mapped_nodes as (
    select n.*, t.jurisdiction_code, t.fiscal_year, t.account_name, t.origin_id,
        case when n.level_header in ('款', '項', '目') and n.axis_header <> s.subject_axis
             then error('Subject level outside the subject axis: ' || n.source_table_key || '/' || n.node_key)
             when n.axis_header = s.subject_axis and n.depth in (1, 2, 3)
                  and n.level_header is not null and n.level_header not in ('款', '項', '目')
             then error('Subject level disagrees with depth: ' || n.source_table_key || '/' || n.node_key)
             when n.level_header in ('款', '項', '目') then n.level_header
             when n.axis_header = s.subject_axis and n.depth = 1 then '款'
             when n.axis_header = s.subject_axis and n.depth = 2 then '項'
             when n.axis_header = s.subject_axis and n.depth = 3 then '目'
             when n.level_header is not null then n.level_header
             else '内訳' || n.depth::varchar end as node_kind,
        {{ fiscal_name('n.name_text') }} as name
    from {{ ref('stg_fiscal__nodes') }} n
    join {{ source('fiscal_metadata', 'tables') }} t using (source_table_key)
    join subject_axes s using (source_table_key)
    where t.document_kind = 'settlement' and t.direction = 'expenditure'
), checked_nodes as (
    select * from mapped_nodes
), mapped_amounts as (
    select a.*, case when m.header is not null then m.phase
             when starts_with(a.header_path, n.axis_header || '/')
                  and split_part(a.header_path, '/', -1) = n.level_header then axis_map.phase
             else null end as amount_role,
        a.amount * case a.unit_text when '円' then 1 when '千円' then 1000
                       else error('Unsupported amount unit: ' || coalesce(a.unit_text, 'NULL')) end as amount_yen
    from {{ ref('stg_fiscal__amounts') }} a
    join checked_nodes n using (source_table_key, node_key)
    left join lateral (
        select header, phase from {{ ref('fiscal_amount_map') }} m
        where coalesce(m.document_kind, '') in ('', 'settlement')
          and {{ trim_cell('m.header') }} in (a.header_path, split_part(a.header_path, '/', -1))
        order by (m.document_kind = 'settlement') desc nulls last,
                 ({{ trim_cell('m.header') }} = a.header_path) desc
        limit 1
    ) m on true
    left join {{ ref('fiscal_amount_map') }} axis_map
      on axis_map.document_kind = 'settlement' and {{ trim_cell('axis_map.header') }} = n.axis_header
), selected_amounts as (
    select source_table_key, node_key,
        sum(amount_yen) filter (where amount_role = 'executed')::bigint as amount_yen,
        case when count(*) filter (where amount_role = 'executed')
                  = count(physical_page) filter (where amount_role = 'executed')
             then min(physical_page) filter (where amount_role = 'executed') end as amount_source_page
    from mapped_amounts group by source_table_key, node_key
), amounts_checked as (
    select n.*, a.amount_yen, a.amount_source_page
    from checked_nodes n left join selected_amounts a using (source_table_key, node_key)
), hierarchy as (
    select n.*, n.code_text as kan_code, null::varchar as kou_code, null::varchar as moku_code,
        n.name as kan_name, null::varchar as kou_name, n.axis_header as subject_axis, [n.node_key] as visited
    from amounts_checked n where n.parent_node_key is null
    union all
    select n.*, h.kan_code,
        case when n.node_kind = '項' and n.axis_header = h.subject_axis then n.code_text else h.kou_code end,
        case when n.node_kind = '目' and n.axis_header = h.subject_axis then n.code_text else h.moku_code end,
        h.kan_name, case when n.node_kind = '項' and n.axis_header = h.subject_axis then n.name else h.kou_name end,
        h.subject_axis, list_append(h.visited, n.node_key)
    from amounts_checked n join hierarchy h
      on n.source_table_key = h.source_table_key and n.parent_node_key = h.node_key
    where not list_contains(h.visited, n.node_key)
), siblings as (
    select * exclude (visited),
        row_number() over sibling as sibling_ordinal, count(*) over sibling_group as sibling_count
    from hierarchy
    window sibling_group as (partition by source_table_key, parent_node_key, axis_header, node_kind, code_text, name),
        sibling as (sibling_group order by origin_id, physical_page, y0, x0, node_key)
), identified as (
    select n.*, sha256(to_json([jurisdiction_code, fiscal_year::varchar, account_name, kan_code, kou_code, moku_code])) as node_id,
        null::varchar as parent_node_id
    from siblings n where parent_node_key is null
    union all
    select n.*,
        case when n.axis_header = n.subject_axis and n.node_kind in ('款', '項', '目')
             then sha256(to_json([n.jurisdiction_code, n.fiscal_year::varchar, n.account_name, n.kan_code, n.kou_code, n.moku_code]))
             else sha256(to_json([p.node_id, n.axis_header, n.node_kind, n.code_text, n.name,
                 case when n.sibling_count > 1 then n.sibling_ordinal::varchar end])) end,
        p.node_id
    from siblings n join identified p
      on n.source_table_key = p.source_table_key and n.parent_node_key = p.node_key
)
select * from identified
