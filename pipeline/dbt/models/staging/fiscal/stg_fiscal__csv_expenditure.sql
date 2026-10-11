{# Raw CSV rows 1:1. Column roles (kan/kou/moku numbers and names, amounts) are\n   declared here; the tree shape is built in intermediate. Unit conversion,\n   code/name splitting, and cross-account checks belong downstream. #}
{% for relation in fiscal_csv_relations() %}
select t.source_table_key,
    {{ trim_cell('"01会計"') }} as account_raw,
    {{ trim_cell('"02款"') }} as kan_raw,
    {{ trim_cell('"03項"') }} as kou_raw,
    {{ trim_cell('"04目"') }} as moku_raw,
    {{ trim_cell('"05事項"') }} as jika_raw,
    {{ trim_cell('"06節"') }} as setsu_raw,
    {{ trim_cell('"07細々節"') }} as saisai_raw,
    "08予算額" as amount_text, {{ staging_amount('"08予算額"') }} as amount,
    source_line_start::integer as source_line_start,
    source_line_end::integer as source_line_end
from {{ source('fiscal_csv', relation) }}
cross join {{ source('fiscal_metadata', 'csv_tables') }} t
where t.relation_prefix = '{{ relation }}'
{% if not loop.last %}union all{% endif %}
{% endfor %}
