-- Legal setsu IDs for 節-axis nodes, shared by the settlement and initial-budget
-- marts so both cannot drift. Names resolve by one shared rule: strip separator
-- marks (、・, spaces), apply the small variant table (異体字・ひらがな), then
-- exact-match the legal label stripped the same way, keeping the definition whose
-- period covers the fiscal year (賃金 was removed in FY2020 with later numbers
-- shifted up). A 節-axis name matching nothing stops the build instead of going
-- NULL. Non-節 axes (備考・事業説明・CSV の科目など) are out of scope.
with setsu_nodes as (
    select node_id, document_kind, fiscal_year, name
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
)
select node_id, document_kind,
    case when expenditure_setsu_id is null
         then error('Unknown setsu name (no legal setsu matches): ' || name)
         else expenditure_setsu_id end as expenditure_setsu_id
from matched
