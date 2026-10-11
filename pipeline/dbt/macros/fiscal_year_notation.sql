{# Trailing-word Japanese-era year/period notation (e.g. 令和 6 年度). #}
{# Past-year breakdown columns name no current-year phase. #}
{# The same literal lives in pipeline/shared/amount.py FISCAL_YEAR_PATTERN; #}
{# amount_test.py reads this file and asserts both stay identical. #}
{% macro fiscal_year_notation(col) -%}
    regexp_full_match({{ col }}, '^(?:明治|大正|昭和|平成|令和)\s*(?:元|\d+)(?:\s*[~〜\-・,、]\s*(?:(?:明治|大正|昭和|平成|令和)\s*)?(?:元|\d+))*\s*年度$')
{%- endmacro %}
