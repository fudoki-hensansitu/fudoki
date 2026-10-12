-- One row per (document_kind, node_id): settlement and initial budgets share
-- subject node_ids, so the kind stays in the key instead of forking the model.
with merged as (
    select * from {{ ref('int_fiscal__settlement_expenditure_rows') }}
    qualify row_number() over (partition by document_kind, node_id order by origin_id, physical_page, y0, x0, source_table_key, node_key) = 1
)
select n.node_id, n.parent_node_id, n.jurisdiction_code, n.fiscal_year, n.document_kind, n.account_name,
    n.axis_header as axis, n.axis_header = n.subject_axis as is_subject, n.node_kind, n.code_text as code, n.name, n.amount_yen,
    not exists (select 1 from merged c where c.document_kind = n.document_kind and c.parent_node_id = n.node_id and c.axis_header = n.axis_header) as is_leaf,
    n.kan_code, n.kou_code, n.moku_code, n.origin_id, n.physical_page as source_page,
    n.x0 as source_x0, n.y0 as source_y0, n.x1 as source_x1, n.y1 as source_y1,
    n.amount_source_page,
    n.amount_source_x0, n.amount_source_y0, n.amount_source_x1, n.amount_source_y1, n.kan_name, n.kou_name
from merged n
