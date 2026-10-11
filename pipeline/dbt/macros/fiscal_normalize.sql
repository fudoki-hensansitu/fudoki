{% macro fiscal_name(col) -%}
    (select array_to_string(list_filter(string_split(text, ''), (ch, i) ->
        not regexp_matches(ch, '\s')
        or coalesce(unicode(regexp_extract(substr(text, 1, i-1), '(\S)\s*$', 1)), 0) <= 127
        or coalesce(unicode(regexp_extract(substr(text, i+1), '^\s*(\S)', 1)), 0) <= 127), '')
     from (select regexp_replace({{ col }}, '[\r\n]', '', 'g') as text))
{%- endmacro %}

{% macro fiscal_match_text(col) -%}
    regexp_replace({{ trim_cell(col) }}, '\s+', '', 'g')
{%- endmacro %}

{% macro fiscal_pdf_relations() %}
    {{ return(['j131041_general_expenditure_detail', 'j131156_general_expenditure_details',
               'j131156_general_expenditure_notes', 'j132021_general_expenditure_details',
               'j132021_general_expenditure_notes']) }}
{% endmacro %}
