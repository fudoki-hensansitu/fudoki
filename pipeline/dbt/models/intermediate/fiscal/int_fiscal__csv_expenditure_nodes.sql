-- Raw CSV rows are already leaf-grain: every row carries its full path. Two column layouts
-- have their own staging: the numbered one (会計/款/項/目/事項/節/細々節, a numeric prefix on
-- each cell) and the named one (会計名称, 款・項・目・細目・節 with separate number and name
-- columns, no 細々節). Group by path prefixes to rebuild the tree in the PDF node shape,
-- using the same subject node_id derivation so both feed one marts table. The level between
-- 目 and 節 keeps the layout's own name (事項 or 細目), and a path without 細々節 ends at 節.
-- Leaf amounts carry the unit the CSV conversion declares (amount_unit); parents
-- hold the subtree sum, which is derived rather than printed.
with numbered as (
    select s.*, t.jurisdiction_code, t.fiscal_year, t.document_kind, t.origin_id, t.amount_unit
    from {{ ref('stg_fiscal__csv_expenditure') }} s
    join {{ source('fiscal_metadata', 'csv_tables') }} t using (source_table_key)
), named as (
    select s.*, t.jurisdiction_code, t.fiscal_year, t.document_kind, t.origin_id, t.amount_unit
    from {{ ref('stg_fiscal__csv_named_expenditure') }} s
    join {{ source('fiscal_metadata', 'csv_tables') }} t using (source_table_key)
), numbered_validated as (
    select *, case when len(list_filter(
            [account_raw, kan_raw, kou_raw, moku_raw, jika_raw, setsu_raw, saisai_raw],
            lambda c: not regexp_full_match(coalesce(c, ''), '^[0-9]+.*$'))) > 0
        then error('CSV hierarchy cell without numeric prefix: ' || source_table_key)
        when amount is null
        then error('Unparseable CSV amount: ' || source_table_key || '/' || amount_text) end as _checked
    from numbered
), named_validated as (
    select *, case when len(list_filter(
            [kan_code, kou_code, moku_code, saimoku_code, setsu_code],
            lambda c: not regexp_full_match(coalesce(c, ''), '^[0-9]+$'))) > 0
            or coalesce(account_name, '') = ''
        then error('CSV hierarchy cell without a number or account: ' || source_table_key)
        when amount is null
        then error('Unparseable CSV amount: ' || source_table_key || '/' || amount_text) end as _checked
    from named
), cells as (
    select jurisdiction_code, fiscal_year, document_kind, origin_id,
        regexp_replace(account_raw, '^[0-9]+', '') as account_name,
        regexp_extract(kan_raw, '^([0-9]+)(.*)$', 1) as kan_code,
        {{ fiscal_name("regexp_extract(kan_raw, '^([0-9]+)(.*)$', 2)") }} as kan_name,
        regexp_extract(kou_raw, '^([0-9]+)(.*)$', 1) as kou_code,
        {{ fiscal_name("regexp_extract(kou_raw, '^([0-9]+)(.*)$', 2)") }} as kou_name,
        regexp_extract(moku_raw, '^([0-9]+)(.*)$', 1) as moku_code,
        {{ fiscal_name("regexp_extract(moku_raw, '^([0-9]+)(.*)$', 2)") }} as moku_name,
        '事項' as jika_kind,
        regexp_extract(jika_raw, '^([0-9]+)(.*)$', 1) as jika_code,
        {{ fiscal_name("regexp_extract(jika_raw, '^([0-9]+)(.*)$', 2)") }} as jika_name,
        regexp_extract(setsu_raw, '^([0-9]+)(.*)$', 1) as setsu_code,
        {{ fiscal_name("regexp_extract(setsu_raw, '^([0-9]+)(.*)$', 2)") }} as setsu_name,
        regexp_extract(saisai_raw, '^([0-9]+)(.*)$', 1) as saisai_code,
        {{ fiscal_name("regexp_extract(saisai_raw, '^([0-9]+)(.*)$', 2)") }} as saisai_name,
        (amount * case amount_unit when '千円' then 1000 when '円' then 1
            else error('Unknown CSV amount unit: ' || coalesce(amount_unit, 'NULL')) end)::bigint as amount_yen, source_line_start
    from numbered_validated
    union all
    select jurisdiction_code, fiscal_year, document_kind, origin_id, account_name,
        kan_code, {{ fiscal_name('kan_name') }}, kou_code, {{ fiscal_name('kou_name') }},
        moku_code, {{ fiscal_name('moku_name') }},
        '細目', saimoku_code, {{ fiscal_name('saimoku_name') }},
        setsu_code, {{ fiscal_name('setsu_name') }}, null, null,
        (amount * case amount_unit when '千円' then 1000 when '円' then 1
            else error('Unknown CSV amount unit: ' || coalesce(amount_unit, 'NULL')) end)::bigint, source_line_start
    from named_validated
), leaves as (
    select distinct jurisdiction_code, fiscal_year, document_kind, origin_id, account_name,
        kan_code, kan_name, kou_code, kou_name, moku_code, moku_name,
        jika_kind, jika_code, jika_name, setsu_code, setsu_name, saisai_code, saisai_name,
        amount_yen, source_line_start
    from cells
), grouped as (
    select jurisdiction_code, fiscal_year, document_kind, origin_id, account_name,
        kan_code, kan_name, kou_code, kou_name, moku_code, moku_name,
        jika_kind, jika_code, jika_name, setsu_code, setsu_name, saisai_code, saisai_name,
        6 as depth, '細々節' as node_kind, saisai_code as code, saisai_name as name,
        sum(amount_yen)::bigint as amount_yen, true as is_leaf,
        min(source_line_start) as source_page, min(source_line_start) as amount_source_page
    from leaves where saisai_code is not null group by all
    union all
    select jurisdiction_code, fiscal_year, document_kind, origin_id, account_name,
        kan_code, kan_name, kou_code, kou_name, moku_code, moku_name,
        jika_kind, jika_code, jika_name, setsu_code, setsu_name, null, null,
        5, '節', setsu_code, setsu_name,
        sum(amount_yen)::bigint, bool_and(saisai_code is null), min(source_line_start),
        case when bool_and(saisai_code is null) then min(source_line_start) end
    from leaves group by all
    union all
    select jurisdiction_code, fiscal_year, document_kind, origin_id, account_name,
        kan_code, kan_name, kou_code, kou_name, moku_code, moku_name,
        jika_kind, jika_code, jika_name, null, null, null, null,
        4, jika_kind, jika_code, jika_name,
        sum(amount_yen)::bigint, false, min(source_line_start), null
    from leaves group by all
    union all
    select jurisdiction_code, fiscal_year, document_kind, origin_id, account_name,
        kan_code, kan_name, kou_code, kou_name, moku_code, moku_name,
        null, null, null, null, null, null, null,
        3, '目', moku_code, moku_name,
        sum(amount_yen)::bigint, false, min(source_line_start), null
    from leaves group by all
    union all
    select jurisdiction_code, fiscal_year, document_kind, origin_id, account_name,
        kan_code, kan_name, kou_code, kou_name, null, null,
        null, null, null, null, null, null, null,
        2, '項', kou_code, kou_name,
        sum(amount_yen)::bigint, false, min(source_line_start), null
    from leaves group by all
    union all
    select jurisdiction_code, fiscal_year, document_kind, origin_id, account_name,
        kan_code, kan_name, null, null, null, null,
        null, null, null, null, null, null, null,
        1, '款', kan_code, kan_name,
        sum(amount_yen)::bigint, false, min(source_line_start), null
    from leaves group by all
), keyed as (
    select g.*,
        sha256(to_json([jurisdiction_code, fiscal_year::varchar, account_name,
            kan_code, null::varchar, null::varchar])) as kan_id,
        sha256(to_json([jurisdiction_code, fiscal_year::varchar, account_name,
            kan_code, kou_code, null::varchar])) as kou_id,
        sha256(to_json([jurisdiction_code, fiscal_year::varchar, account_name,
            kan_code, kou_code, moku_code])) as moku_id
    from grouped g
), linked as (
    select k.*,
        case node_kind
             when '款' then null
             when '項' then kan_id
             when '目' then kou_id
             when '事項' then moku_id
             when '細目' then moku_id
             when '節' then sha256(to_json([moku_id, '科目', jika_kind, jika_code, jika_name]))
             when '細々節' then sha256(to_json([
                 sha256(to_json([moku_id, '科目', jika_kind, jika_code, jika_name])),
                 '科目', '節', setsu_code, setsu_name]))
        end as parent_node_id
    from keyed k
)
select case node_kind
         when '款' then kan_id
         when '項' then kou_id
         when '目' then moku_id
         else sha256(to_json([parent_node_id, '科目', node_kind, code, name]))
       end as node_id,
    parent_node_id, jurisdiction_code, fiscal_year, document_kind, account_name,
    '科目' as axis, true as is_subject, node_kind, code, name, amount_yen, is_leaf,
    kan_code, kou_code, moku_code, origin_id, source_page,
    null::double as source_x0, null::double as source_y0, null::double as source_x1, null::double as source_y1,
    amount_source_page,
    null::double as amount_source_x0, null::double as amount_source_y0,
    null::double as amount_source_x1, null::double as amount_source_y1,
    kan_name, kou_name,
    null::bigint as amendment_yen  -- a council amendment applies to PDF budget books only
from linked
