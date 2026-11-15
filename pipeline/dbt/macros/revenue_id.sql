{# 歳入の根（自治体・年度・資料区分・補正号・会計）の ID。歳出の根の ID と同じ材料に向きを足す #}
{% macro revenue_id(prefix='') -%}
sha256(to_json([{{ prefix }}jurisdiction_code, {{ prefix }}fiscal_year::varchar, {{ prefix }}document_kind,
    coalesce({{ prefix }}amendment_number::varchar, ''), {{ prefix }}account_name, 'revenue']))
{%- endmacro %}
