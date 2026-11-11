-- A volume that starts inside a row of the volume before prints it again, with no amount, in the running header
-- of its first page (131211's general account, `continued_rows`): that copy is the node the amount-printing row
-- of the volume before stands for (int_fiscal__settlement_expenditure_nodes), not a second print of it.
-- A 款 or 項 the 総括 prints with its amount is printed again, with no amount, as the title over its own pages
-- (`running_titles`, 千代田区・中野区の当初予算): that title is a copy of the same node in the same table, whatever
-- the title's reading of the name.
with printed as (select * from {{ ref('int_fiscal__settlement_expenditure_rows') }}),
rows as (
    select *, amount_yen is null and (
        physical_page = min(physical_page) over (partition by source_table_key)
        or (axis_header = subject_axis and node_kind in ('款', '項')
            and count(amount_yen) over (partition by source_table_key, node_id) > 0)) as continued
    from printed
),
counts as (select source_table_key, count(*) as n from rows group by 1),
annotations as (
    select source_table_key, count(*) as n from {{ ref('stg_fiscal__nodes') }}
    where axis_header = '注記' group by 1
)
select t.source_table_key, 'missing_or_duplicated_row' as failure
from {{ source('fiscal_metadata', 'tables') }} t
left join counts c using (source_table_key)
left join annotations a using (source_table_key)
where coalesce(c.n, 0) <> t.nodes_row_count - coalesce(a.n, 0)
union all
select source_table_key, 'invalid_node' from rows
where node_kind is null or name is null or name = '' or axis_header is null or axis_header = ''
   or (parent_node_key is null and (node_kind <> '款' or axis_header <> subject_axis))
   or (axis_header = subject_axis and (node_kind not in ('款','項','目')
       -- A 款・項 prints its number, except one the year drops (no budget this year, printed beside last year's:
       -- `共同事業拠出金 0 1`, `(保健事業費)`), and a 款 in an account-year that identifies its 款 by name.
       or (code_text is null and node_kind = '項' and coalesce(amount_yen, 0) <> 0)
       or (code_text is null and node_kind = '款' and coalesce(amount_yen, 0) <> 0 and not exists (
           select 1 from {{ ref('fiscal_kan_name_identity') }} k
           where k.jurisdiction_code = rows.jurisdiction_code and k.fiscal_year = rows.fiscal_year
             and k.account_name = rows.account_name))))
union all
-- node_id joins the key so numberless 目 (parent-based identity) never lump with their 項.
-- Tables printing the whole account agree on the amount; the shares of division tables
-- (所属, ADR 0030) are summed, and where a whole prints the node they add up to it.
-- A council amendment's lines (seed fiscal_budget_amendment) print the budget book's nodes again on purpose;
-- they are applied in the nodes model and checked in fiscal_budget_amendment_applied.
select min(source_table_key), 'cross_table_subject_disagreement' from rows
where axis_header = subject_axis and node_kind in ('款', '項', '目') and not is_amendment
group by jurisdiction_code, fiscal_year, document_kind, account_name, kan_code, kou_code, moku_code, node_id
-- A title copy prints no amount and is read off the running header (cut short, `連続立体化事業関連都市計`, or misread,
-- `上木費`): the names that agree are the ones printed with an amount, which the nodes model keeps.
having case when count(amount_yen) > 0 then count(distinct name) filter (where amount_yen is not null)
            else count(distinct name) end <> 1
    or count(distinct amount_yen) filter (where division is null) > 1
    or (count(amount_yen) > 0 and count(amount_yen) <> count(*) filter (where not continued))
    or count(distinct parent_node_id) > 1
    or (count(*) filter (where division is null) > 0 and count(*) filter (where division is not null) > 0
        and sum(amount_yen) filter (where division is not null)
            is distinct from min(amount_yen) filter (where division is null))
union all
-- Two divisions print the same 節 of the same 目 as one node; a table never prints it twice.
select min(source_table_key), 'non_subject_id_collision' from rows
where axis_header <> subject_axis and not is_amendment group by document_kind, node_id
having count(*) filter (where not continued) > 1 and (count(*) filter (where division is null) > 0
    or count(distinct source_table_key) <> count(*)
    or (count(amount_yen) > 0 and count(amount_yen) <> count(*)))
union all
-- A division prints its share of an account once; a second table of it would count it twice.
select min(source_table_key), 'duplicated_division' from {{ source('fiscal_metadata', 'tables') }}
where division is not null
group by jurisdiction_code, fiscal_year, document_kind, direction, account_name, division
having count(*) > 1
