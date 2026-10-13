-- A name of two or more characters cut short at the foot of a page resolves to the one legal setsu it
-- begins; a name that begins several (or none) resolves to none, which stops `int_fiscal__expenditure_setsu`.
-- depends_on: {{ ref('setsu_master') }}
select 'cut_name' as failure
where coalesce({{ fiscal_setsu_prefix_ids("'負担金補助及'", 2025) }}, []) <> ['setsu-18']
   or coalesce({{ fiscal_setsu_prefix_ids("'職員手当'", 2025) }}, []) <> ['setsu-03']
   or coalesce({{ fiscal_setsu_prefix_ids("'共済'", 2025) }}, []) <> ['setsu-04']
   -- one character is no evidence of a cut name (報 begins 報酬 and 報償費, 給 begins only 給料): no match
   or coalesce(len({{ fiscal_setsu_prefix_ids("'報'", 2025) }}), 0) <> 0
   or coalesce(len({{ fiscal_setsu_prefix_ids("'給'", 2025) }}), 0) <> 0
   -- begins no legal label
   or coalesce(len({{ fiscal_setsu_prefix_ids("'給料手当'", 2025) }}), 0) <> 0
   -- the legal setsu of the fiscal year: 旅費 was setsu-09 until 2019
   or coalesce({{ fiscal_setsu_prefix_ids("'旅費'", 2019) }}, []) <> ['setsu-09-2019']
   or coalesce({{ fiscal_setsu_prefix_ids("'旅費'", 2025) }}, []) <> ['setsu-08']
