{# Raw CSV rows 1:1 for the named layout (会計名称, 款・款名称, 項・項名称, 目・目名称, 細目・細目名称,
   節・節名称; 多摩市の当初予算). Numbers and names are already separate columns. The tree shape is
   built in intermediate with the numbered layout. #}
{% set relations = fiscal_csv_layout_relations('named') %}
{% for item in relations %}{% set relation = item['relation'] %}
select t.source_table_key,
    {{ trim_cell('"会計名称"') }} as account_name,
    {{ trim_cell('"款"') }} as kan_code, {{ trim_cell('"款名称"') }} as kan_name,
    {{ trim_cell('"項"') }} as kou_code, {{ trim_cell('"項名称"') }} as kou_name,
    {{ trim_cell('"目"') }} as moku_code, {{ trim_cell('"目名称"') }} as moku_name,
    {{ trim_cell('"細目"') }} as saimoku_code, {{ trim_cell('"細目名称"') }} as saimoku_name,
    {{ trim_cell('"節"') }} as setsu_code, {{ trim_cell('"節名称"') }} as setsu_name,
    "{{ item['amount_column'] }}" as amount_text, {{ staging_amount('"' ~ item['amount_column'] ~ '"') }} as amount,
    source_line_start::integer as source_line_start,
    source_line_end::integer as source_line_end
from {{ ingestion_table(relation) }}
cross join {{ source('fiscal_metadata', 'csv_tables') }} t
where t.relation_prefix = '{{ relation }}'
{% if not loop.last %}union all{% endif %}
{% endfor %}
{% if not relations %}
select null::varchar as source_table_key, null::varchar as account_name,
    null::varchar as kan_code, null::varchar as kan_name, null::varchar as kou_code, null::varchar as kou_name,
    null::varchar as moku_code, null::varchar as moku_name, null::varchar as saimoku_code, null::varchar as saimoku_name,
    null::varchar as setsu_code, null::varchar as setsu_name, null::varchar as amount_text, null::bigint as amount,
    null::integer as source_line_start, null::integer as source_line_end
where false
{% endif %}
