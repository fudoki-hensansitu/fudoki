-- The character distance behind the printed-number fallback of `int_fiscal__expenditure_setsu`
-- (`setsu_match` = 'code'). DuckDB's levenshtein() counts UTF-8 bytes, so a one-kanji misread must read 1 here.
-- depends_on: {{ ref('setsu_master') }}
select 'char_distance' as failure
where {{ fiscal_char_distance("'報償費'", "'報價費'") }} <> 1             -- one kanji misread
   or {{ fiscal_char_distance("'需用費'", "'需一用一費'") }} <> 2        -- two characters inserted
   or {{ fiscal_char_distance("'償還金利子及び割引料'", "'還金利子及び割引料'") }} <> 1  -- the first one dropped
   or {{ fiscal_char_distance("'需用費'", "'需用費'") }} <> 0
   or {{ fiscal_char_distance("''", "'需用費'") }} <> 3                  -- empty on either side
   or {{ fiscal_char_distance("'需用費'", "''") }} <> 3
   or {{ fiscal_char_distance("'旅費'", "'負担金補助及び交付金'") }} <= 2  -- an unrelated name stays far
   -- the hiragana conjunction reads as the legal 及び once separators are gone
   or {{ fiscal_setsu_strip("'負担金、補助および交付金'") }} <> '負担金補助及び交付金'
