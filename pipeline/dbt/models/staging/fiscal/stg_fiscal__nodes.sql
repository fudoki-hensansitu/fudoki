{% for relation in fiscal_pdf_relations() %}
select t.source_table_key, n.node_key, n.parent_node_key,
    {{ trim_cell('n.axis_header') }} as axis_header, n.depth::integer as depth,
    {{ trim_cell('n.level_header') }} as level_header,
    {{ trim_cell('n.code_text') }} as code_text, {{ trim_cell('n.name_text') }} as name_text,
    n.physical_page::integer as physical_page, n.x0, n.y0, n.x1, n.y1
from {{ source('fiscal_pdf', relation ~ '_nodes') }} n
cross join {{ source('fiscal_metadata', 'tables') }} t
where t.relation_prefix = '{{ relation }}'
{% if not loop.last %}union all{% endif %}
{% endfor %}
