{% for relation in fiscal_pdf_relations() %}
select t.source_table_key, a.node_key, {{ trim_cell('a.header_path') }} as header_path,
    a.amount_text, {{ staging_amount('a.amount_text') }} as amount,
    {{ trim_cell('a.unit_text') }} as unit_text,
    a.physical_page::integer as physical_page, a.x0, a.y0, a.x1, a.y1
from {{ source('fiscal_pdf', relation ~ '_amounts') }} a
cross join {{ source('fiscal_metadata', 'tables') }} t
where t.relation_prefix = '{{ relation }}'
{% if not loop.last %}union all{% endif %}
{% endfor %}
