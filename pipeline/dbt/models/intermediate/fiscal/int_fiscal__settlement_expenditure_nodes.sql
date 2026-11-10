-- One row per (document_kind, node_id): settlement and initial budgets share
-- subject node_ids, so the kind stays in the key instead of forking the model.
-- Tables that print one division's (所属) share of an account (ADR 0030) add up:
-- a node they share takes the sum of their amounts, which has no single printed box.
-- A table without a division prints the whole; where one prints the node, it stands
-- for the node and the shares are checked against it (tests/fiscal_rows_contract.sql).
-- A volume that continues a row of the volume before (131211's general account, cut anywhere) prints it again
-- with no amount (`continued_rows`): the row that prints the amount stands for the node.
-- A council amendment (seed fiscal_budget_amendment) prints the amended lines of the budget book in a table of its
-- own: its nodes are not added, and each line's 修正金額−原案金額 moves the approved amount of the same node and
-- of every ancestor up to its 款 (`amendment_yen`). A branch the amendment does not print (the 節) keeps the
-- proposed amount; fiscal_tree_balances allows exactly that difference.
with recursive ranked as (
    select r.*,
        count(*) filter (where r.division is null) over node as whole_rows,
        count(*) filter (where r.division is not null) over node as division_rows,
        count(r.amount_yen) filter (where r.division is not null) over node as division_printed,
        sum(r.amount_yen) filter (where r.division is not null) over node as division_amount
    from {{ ref('int_fiscal__settlement_expenditure_rows') }} r
    where not r.is_amendment
    window node as (partition by r.document_kind, r.node_id)
), merged as (
    select * replace (
        case when whole_rows = 0 and division_rows > 1
             then case when division_printed = division_rows then division_amount::bigint end
             else amount_yen end as amount_yen,
        case when whole_rows = 0 and division_rows > 1 then null else amount_source_page end as amount_source_page,
        case when whole_rows = 0 and division_rows > 1 then null else amount_source_x0 end as amount_source_x0,
        case when whole_rows = 0 and division_rows > 1 then null else amount_source_y0 end as amount_source_y0,
        case when whole_rows = 0 and division_rows > 1 then null else amount_source_x1 end as amount_source_x1,
        case when whole_rows = 0 and division_rows > 1 then null else amount_source_y1 end as amount_source_y1)
    from ranked
    qualify row_number() over (partition by document_kind, node_id
        order by division is not null, amount_yen is null, origin_id, physical_page, y0, x0, source_table_key, node_key) = 1
), amended_lines as (
    -- The lines of the amendment that print both amounts: the deepest 事務事業 (修正金額 and 原案金額).
    select document_kind, node_id, amount_yen - proposed_yen as amendment_yen
    from {{ ref('int_fiscal__settlement_expenditure_rows') }}
    where is_amendment and amount_yen is not null and proposed_yen is not null
), amended_path(document_kind, node_id, amendment_yen) as (
    select document_kind, node_id, amendment_yen from amended_lines
    union all
    select p.document_kind, m.parent_node_id, p.amendment_yen
    from amended_path p join merged m on m.document_kind = p.document_kind and m.node_id = p.node_id
    where m.parent_node_id is not null
), amendments as (
    select document_kind, node_id, sum(amendment_yen)::bigint as amendment_yen from amended_path group by all
), applied as (
    -- An amended amount is printed nowhere as one box (the budget book prints the proposed one): no amount box.
    select m.* replace (
        m.amount_yen + coalesce(a.amendment_yen, 0) as amount_yen,
        case when a.node_id is null then m.amount_source_page end as amount_source_page,
        case when a.node_id is null then m.amount_source_x0 end as amount_source_x0,
        case when a.node_id is null then m.amount_source_y0 end as amount_source_y0,
        case when a.node_id is null then m.amount_source_x1 end as amount_source_x1,
        case when a.node_id is null then m.amount_source_y1 end as amount_source_y1),
        a.amendment_yen
    from merged m left join amendments a using (document_kind, node_id)
)
select n.node_id, n.parent_node_id, n.jurisdiction_code, n.fiscal_year, n.document_kind, n.account_name,
    n.axis_header as axis, n.axis_header = n.subject_axis as is_subject, n.node_kind, n.code_text as code, n.name, n.amount_yen,
    not exists (select 1 from applied c where c.document_kind = n.document_kind and c.parent_node_id = n.node_id and c.axis_header = n.axis_header) as is_leaf,
    n.kan_code, n.kou_code, n.moku_code, n.origin_id, n.physical_page as source_page,
    n.x0 as source_x0, n.y0 as source_y0, n.x1 as source_x1, n.y1 as source_y1,
    n.amount_source_page,
    n.amount_source_x0, n.amount_source_y0, n.amount_source_x1, n.amount_source_y1, n.kan_name, n.kou_name,
    n.amendment_yen
from applied n
