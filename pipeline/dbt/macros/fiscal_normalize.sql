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

{% macro fiscal_setsu_strip(col) -%}
    {#- Names arrive NFKC-normalized from staging. Separators go, and the conjunction printed in hiragana
        (`負担金、補助および交付金`, 132055) reads as the legal 及び. Other words wait for a real case. -#}
    replace(regexp_replace({{ col }}, '[、，,､・･·.．\s　]+', '', 'g'), 'および', '及び')
{%- endmacro %}

{% macro fiscal_setsu_prefix_ids(norm_name, fiscal_year) -%}
    {#- The legal setsu (of that fiscal year) whose label begins with the printed name: a name cut short at
        the foot of a page (`職員手当`, `負担金補助及`). A single character is no evidence of a cut name, and several
        matches are not a match (the caller stops). -#}
    (select list(m.expenditure_setsu_id order by m.expenditure_setsu_id)
     from {{ ref('setsu_master') }} m
     where length({{ norm_name }}) >= 2
       and starts_with({{ fiscal_setsu_strip('m.label') }}, {{ norm_name }})
       and {{ fiscal_year }} >= coalesce(m.valid_from_fiscal_year, -2147483648)
       and {{ fiscal_year }} <= coalesce(m.valid_to_fiscal_year, 2147483647))
{%- endmacro %}

{% macro fiscal_char_distance(a, b) -%}
    {#- Levenshtein distance in characters. DuckDB's levenshtein() counts UTF-8 bytes (one kanji = 3), so a
        one-character misread of a 節 name would read as 3. Row by row: each step keeps the previous row. -#}
    list_reduce(list_prepend(range(0, len({{ b }}) + 1), list_transform(range(1, len({{ a }}) + 1), i -> [i])),
        (prev, x) -> list_reduce(list_prepend([x[1]], list_transform(range(1, len({{ b }}) + 1), j -> [j])),
            (row, y) -> list_append(row, least(row[-1] + 1, prev[y[1] + 1] + 1,
                prev[y[1]] + case when substr({{ a }}, x[1]::integer, 1) = substr({{ b }}, y[1]::integer, 1)
                                  then 0 else 1 end))))[-1]
{%- endmacro %}
