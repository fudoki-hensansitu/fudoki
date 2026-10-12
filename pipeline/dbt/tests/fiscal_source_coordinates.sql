-- Printed boxes are well-formed, and a box needs its page (CSV has no box at all).
-- A stored node box may lack x (only y0/y1 kept), so completeness is not asserted for
-- nodes; an amount box is one print and is all-or-nothing. A node's y0 can exceed y1
-- (3 rows in 131156: the name seems to continue on the next page), so only x and the
-- amount y are ordered.
{% for m in ['settlement_expenditure_node', 'initial_expenditure_node'] %}
select node_id, '{{ m }}' as model from {{ ref(m) }}
where ((amount_source_x0 is null)::int + (amount_source_y0 is null)::int
         + (amount_source_x1 is null)::int + (amount_source_y1 is null)::int) not in (0, 4)
       or source_x0 > source_x1
       or amount_source_x0 > amount_source_x1 or amount_source_y0 > amount_source_y1
       or ((source_x0 is not null or source_y0 is not null) and source_page is null)
       or (amount_source_x0 is not null and amount_source_page is null)
{% if not loop.last %}union all{% endif %}
{% endfor %}
