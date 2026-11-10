{# 歳出の根（自治体・年度・資料区分・補正号・会計）の ID。補正号の無い資料は空文字で hash に入れる #}
{% macro expenditure_id(prefix='') -%}
sha256(to_json([{{ prefix }}jurisdiction_code, {{ prefix }}fiscal_year::varchar, {{ prefix }}document_kind,
    coalesce({{ prefix }}amendment_number::varchar, ''), {{ prefix }}account_name]))
{%- endmacro %}
