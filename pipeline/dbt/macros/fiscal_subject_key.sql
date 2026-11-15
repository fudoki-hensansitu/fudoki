{# 科目のノードの id の材料。歳入は末尾に向きを足し、歳入の款1が歳出の款1と同じ id にならないようにする。
   歳出は向きを足す前の材料のままにし、公開している ID（subject_id・detail_id・line_id）を変えない #}
{% macro fiscal_subject_key(prefix='') -%}
list_concat([{{ prefix }}jurisdiction_code, {{ prefix }}fiscal_year::varchar, {{ prefix }}account_name, {{ prefix }}kan_key,
    {{ prefix }}kou_code, {{ prefix }}moku_code],
    case when {{ prefix }}direction = 'revenue' then ['revenue'] else []::varchar[] end)
{%- endmacro %}
