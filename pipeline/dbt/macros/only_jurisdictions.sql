{# dbt:build --jurisdiction で一部の自治体だけを build したとき、他の自治体を宣言した seed の行を検査から外す条件。
   絞っていなければ常に真。 #}
{% macro only_jurisdictions(column) %}
    {%- set codes = var('only_jurisdictions', []) -%}
    {%- if codes -%}{{ column }} in ({% for c in codes %}'{{ c }}'{% if not loop.last %}, {% endif %}{% endfor %}){%- else -%}true{%- endif -%}
{% endmacro %}
