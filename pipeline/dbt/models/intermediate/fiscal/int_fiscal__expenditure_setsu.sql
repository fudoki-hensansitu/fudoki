-- Legal setsu IDs for 節-axis nodes, shared by the settlement and initial-budget
-- marts so both cannot drift. Names resolve by one shared rule: strip separator
-- marks (、・, spaces), apply the small variant table (異体字・ひらがな), then
-- exact-match the legal label stripped the same way, keeping the definition whose
-- period covers the fiscal year (賃金 was removed in FY2020 with later numbers
-- shifted up). A name that matches no legal label exactly is read as a name cut
-- short at the foot of a page (`職員手当` for 職員手当等) when it is the beginning
-- of exactly one legal label of that fiscal year (`setsu_match` = 'prefix');
-- several labels, or none, stop the build instead of going NULL. Last, a name OCR
-- misread (`報價費`, `還金利子及び割引料`) resolves by its printed 節 number when the one
-- legal setsu of that number and year is within 2 characters of the stripped name
-- (`setsu_match` = 'code'): number and name must both agree, so neither a misread number
-- nor a near name alone moves a row. A 細節 printed under its 節 with an enumerator
-- (`(2)光熱水費` beside 節 10) has no legal label of its own and takes the legal setsu of
-- its printed number (`setsu_match` = 'number'). The printed name stays as it is. Non-節 axes
-- (備考・事業説明・CSV の科目など) are out of scope.
with setsu_nodes as (
    select node_id, document_kind, fiscal_year, name, code
    from {{ ref('int_fiscal__settlement_expenditure_nodes') }}
    where axis = '節'
), stripped as (
    select *, {{ fiscal_setsu_strip('name') }} as stripped_name
    from setsu_nodes
), canonicalized as (
    select s.*, coalesce(v.canonical, s.stripped_name) as norm_name
    from stripped s
    left join {{ ref('setsu_name_variants') }} v
      on {{ fiscal_setsu_strip('v.variant') }} = s.stripped_name
), matched as (
    select c.*,
        (select m.expenditure_setsu_id from {{ ref('setsu_master') }} m
         where {{ fiscal_setsu_strip('m.label') }} = c.norm_name
           and c.fiscal_year >= coalesce(m.valid_from_fiscal_year, -2147483648)
           and c.fiscal_year <= coalesce(m.valid_to_fiscal_year, 2147483647)) as expenditure_setsu_id
    from canonicalized c
), by_code as (
    -- The legal setsu sharing the printed number in that fiscal year, with the name distance.
    select m.node_id, l.expenditure_setsu_id,
        {{ fiscal_char_distance(fiscal_setsu_strip('l.label'), 'm.norm_name') }} as distance
    from matched m
    join {{ ref('setsu_master') }} l
      on try_cast(l.code as integer) = try_cast(m.code as integer)
     and m.fiscal_year >= coalesce(l.valid_from_fiscal_year, -2147483648)
     and m.fiscal_year <= coalesce(l.valid_to_fiscal_year, 2147483647)
    where m.expenditure_setsu_id is null
), code_match as (
    select node_id, count(*) as code_count,
        list(expenditure_setsu_id) filter (where distance <= 2) as code_ids,
        list(expenditure_setsu_id) as number_ids
    from by_code group by node_id
), resolved as (
    select m.*, {{ fiscal_setsu_prefix_ids('m.norm_name', 'm.fiscal_year') }} as prefix_ids,
        c.code_ids, c.number_ids, c.code_count
    from matched m
    left join code_match c using (node_id)
)
select node_id, document_kind,
    case when expenditure_setsu_id is not null then expenditure_setsu_id
         when len(prefix_ids) = 1 then prefix_ids[1]
         when len(prefix_ids) > 1
         then error('Ambiguous setsu name (several legal setsu begin with it): ' || name)
         when code_count = 1 and len(code_ids) = 1 then code_ids[1]
         when regexp_matches(name, '^[(（][0-9]+[)）]') and code_count = 1 then number_ids[1]
         else error('Unknown setsu name (no legal setsu matches): ' || name) end as expenditure_setsu_id,
    case when expenditure_setsu_id is not null then 'exact'
         when len(prefix_ids) = 1 then 'prefix'
         when not (code_count = 1 and len(code_ids) = 1) then 'number'
         else 'code' end as setsu_match
from resolved
