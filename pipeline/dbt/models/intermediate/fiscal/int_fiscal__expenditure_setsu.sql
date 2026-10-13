-- Legal setsu IDs for 節-axis nodes, shared by the settlement and initial-budget
-- marts so both cannot drift. Names resolve by one shared rule: strip separator
-- marks (、・, spaces), apply the small variant table (異体字・ひらがな), then
-- exact-match the legal label stripped the same way, keeping the definition whose
-- period covers the fiscal year (賃金 was removed in FY2020 with later numbers
-- shifted up). A name that matches no legal label exactly is read as a name cut
-- short at the foot of a page (`職員手当` for 職員手当等) when it is the beginning
-- of exactly one legal label of that fiscal year (`setsu_match` = 'prefix');
-- several labels, or none, stop the build instead of going NULL. Non-節 axes
-- (備考・事業説明・CSV の科目など) are out of scope.
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
), resolved as (
    select m.*, {{ fiscal_setsu_prefix_ids('m.norm_name', 'm.fiscal_year') }} as prefix_ids
    from matched m
)
select node_id, document_kind,
    case when expenditure_setsu_id is not null then expenditure_setsu_id
         when len(prefix_ids) = 1 then prefix_ids[1]
         when len(prefix_ids) > 1
         then error('Ambiguous setsu name (several legal setsu begin with it): ' || name)
         else error('Unknown setsu name (no legal setsu matches): ' || name) end as expenditure_setsu_id,
    case when expenditure_setsu_id is not null then 'exact' else 'prefix' end as setsu_match
from resolved
