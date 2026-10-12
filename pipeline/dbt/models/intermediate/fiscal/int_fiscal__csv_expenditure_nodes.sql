-- Raw CSV rows are already leaf-grain: every row carries its full
-- 会計/款/項/目/事項/節/細々節 path with a numeric prefix on each cell.
-- Group by path prefixes to rebuild the tree in the PDF node shape,
-- using the same subject node_id derivation so both feed one marts table.
-- Leaf amounts are千円 (per the 132047 README scale note); parents hold
-- the subtree sum, which is derived rather than printed.
with base as (
    select s.*, t.jurisdiction_code, t.fiscal_year, t.document_kind, t.origin_id
    from {{ ref('stg_fiscal__csv_expenditure') }} s
    join {{ source('fiscal_metadata', 'csv_tables') }} t using (source_table_key)
), validated as (
    select *, case when len(list_filter(
            [account_raw, kan_raw, kou_raw, moku_raw, jika_raw, setsu_raw, saisai_raw],
            c -> not regexp_full_match(coalesce(c, ''), '^[0-9]+.*$'))) > 0
        then error('CSV hierarchy cell without numeric prefix: ' || source_table_key)
        when amount is null
        then error('Unparseable CSV amount: ' || source_table_key || '/' || amount_text) end as _checked
    from base
), cells as (
    select jurisdiction_code, fiscal_year, document_kind, origin_id,
        regexp_replace(account_raw, '^[0-9]+', '') as account_name,
        regexp_extract(kan_raw, '^([0-9]+)(.*)$', 1) as kan_code,
        {{ fiscal_name("regexp_extract(kan_raw, '^([0-9]+)(.*)$', 2)") }} as kan_name,
        regexp_extract(kou_raw, '^([0-9]+)(.*)$', 1) as kou_code,
        {{ fiscal_name("regexp_extract(kou_raw, '^([0-9]+)(.*)$', 2)") }} as kou_name,
        regexp_extract(moku_raw, '^([0-9]+)(.*)$', 1) as moku_code,
        {{ fiscal_name("regexp_extract(moku_raw, '^([0-9]+)(.*)$', 2)") }} as moku_name,
        regexp_extract(jika_raw, '^([0-9]+)(.*)$', 1) as jika_code,
        {{ fiscal_name("regexp_extract(jika_raw, '^([0-9]+)(.*)$', 2)") }} as jika_name,
        regexp_extract(setsu_raw, '^([0-9]+)(.*)$', 1) as setsu_code,
        {{ fiscal_name("regexp_extract(setsu_raw, '^([0-9]+)(.*)$', 2)") }} as setsu_name,
        regexp_extract(saisai_raw, '^([0-9]+)(.*)$', 1) as saisai_code,
        {{ fiscal_name("regexp_extract(saisai_raw, '^([0-9]+)(.*)$', 2)") }} as saisai_name,
        (amount * 1000)::bigint as amount_yen, source_line_start
    from validated
), leaves as (
    select distinct jurisdiction_code, fiscal_year, document_kind, origin_id, account_name,
        kan_code, kan_name, kou_code, kou_name, moku_code, moku_name,
        jika_code, jika_name, setsu_code, setsu_name, saisai_code, saisai_name,
        amount_yen, source_line_start
    from cells
), grouped as (
    select jurisdiction_code, fiscal_year, document_kind, origin_id, account_name,
        kan_code, kan_name, kou_code, kou_name, moku_code, moku_name,
        jika_code, jika_name, setsu_code, setsu_name, saisai_code, saisai_name,
        6 as depth, '細々節' as node_kind, saisai_code as code, saisai_name as name,
        sum(amount_yen) as amount_yen, true as is_leaf,
        min(source_line_start) as source_page, min(source_line_start) as amount_source_page
    from leaves group by all
    union all
    select jurisdiction_code, fiscal_year, document_kind, origin_id, account_name,
        kan_code, kan_name, kou_code, kou_name, moku_code, moku_name,
        jika_code, jika_name, setsu_code, setsu_name, null, null,
        5, '節', setsu_code, setsu_name,
        sum(amount_yen), false, min(source_line_start), null
    from leaves group by all
    union all
    select jurisdiction_code, fiscal_year, document_kind, origin_id, account_name,
        kan_code, kan_name, kou_code, kou_name, moku_code, moku_name,
        jika_code, jika_name, null, null, null, null,
        4, '事項', jika_code, jika_name,
        sum(amount_yen), false, min(source_line_start), null
    from leaves group by all
    union all
    select jurisdiction_code, fiscal_year, document_kind, origin_id, account_name,
        kan_code, kan_name, kou_code, kou_name, moku_code, moku_name,
        null, null, null, null, null, null,
        3, '目', moku_code, moku_name,
        sum(amount_yen), false, min(source_line_start), null
    from leaves group by all
    union all
    select jurisdiction_code, fiscal_year, document_kind, origin_id, account_name,
        kan_code, kan_name, kou_code, kou_name, null, null,
        null, null, null, null, null, null,
        2, '項', kou_code, kou_name,
        sum(amount_yen), false, min(source_line_start), null
    from leaves group by all
    union all
    select jurisdiction_code, fiscal_year, document_kind, origin_id, account_name,
        kan_code, kan_name, null, null, null, null,
        null, null, null, null, null, null,
        1, '款', kan_code, kan_name,
        sum(amount_yen), false, min(source_line_start), null
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
             when '節' then sha256(to_json([moku_id, '科目', '事項', jika_code, jika_name]))
             when '細々節' then sha256(to_json([
                 sha256(to_json([moku_id, '科目', '事項', jika_code, jika_name])),
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
    kan_name, kou_name
from linked
