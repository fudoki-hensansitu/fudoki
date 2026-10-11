-- Preserve English word spaces; remove Japanese letter spacing and wrapped lines.
-- depends_on: {{ ref('stg_fiscal__nodes') }}
select 'name_normalization' as failure
where {{ fiscal_name("'議 会 費'") }} <> '議会費'
   or {{ fiscal_name("'ABC Test 事 業'") }} <> 'ABC Test 事業'
   or {{ fiscal_name("'ABC  Test 事  業'") }} <> 'ABC  Test 事業'
   or {{ fiscal_name("'議' || chr(10) || '会 費'") }} <> '議会費'
   or {{ fiscal_match_text("' ＡＢＣ　事 業 '") }} <> 'ABC事業'
