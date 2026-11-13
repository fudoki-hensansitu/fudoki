{# Raw CSV rows 1:1 for the numbered layout (01会計…07細々節, each cell 番号+名称). Column roles
   (kan/kou/moku numbers and names, amounts) are declared here; the tree shape is built in
   intermediate. Unit conversion, code/name splitting, and cross-account checks belong downstream. #}
{% set relations = fiscal_csv_layout_relations('numbered') %}
{% for item in relations %}{% set relation = item['relation'] %}
select t.source_table_key,
    {{ trim_cell('"01会計"') }} as account_raw,
    {{ trim_cell('"02款"') }} as kan_raw,
    {{ trim_cell('"03項"') }} as kou_raw,
    {{ trim_cell('"04目"') }} as moku_raw,
    {{ trim_cell('"05事項"') }} as jika_raw,
    {{ trim_cell('"06節"') }} as setsu_raw,
    {{ trim_cell('"07細々節"') }} as saisai_raw,
    "{{ item['amount_column'] }}" as amount_text, {{ staging_amount('"' ~ item['amount_column'] ~ '"') }} as amount,
    source_line_start::integer as source_line_start,
    source_line_end::integer as source_line_end
from {{ ingestion_table(relation) }}
cross join {{ source('fiscal_metadata', 'csv_tables') }} t
where t.relation_prefix = '{{ relation }}'
{% if not loop.last %}union all{% endif %}
{% endfor %}
{% if not relations %}
select null::varchar as source_table_key, null::varchar as account_raw, null::varchar as kan_raw,
    null::varchar as kou_raw, null::varchar as moku_raw, null::varchar as jika_raw, null::varchar as setsu_raw,
    null::varchar as saisai_raw, null::varchar as amount_text, null::bigint as amount,
    null::integer as source_line_start, null::integer as source_line_end
where false
{% endif %}
