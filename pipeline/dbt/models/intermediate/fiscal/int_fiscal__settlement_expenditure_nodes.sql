with merged as (
    select * from {{ ref('int_fiscal__settlement_expenditure_rows') }}
    qualify row_number() over (partition by node_id order by origin_id, physical_page, y0, x0, source_table_key, node_key) = 1
)
select n.node_id, n.parent_node_id, n.jurisdiction_code, n.fiscal_year, n.account_name,
    n.axis_header as axis, n.node_kind, n.code_text as code, n.name, n.amount_yen,
    not exists (select 1 from merged c where c.parent_node_id = n.node_id and c.axis_header = n.axis_header) as is_leaf,
    n.kan_code, n.kou_code, n.moku_code, n.origin_id, n.physical_page as source_page,
    n.amount_source_page, n.kan_name, n.kou_name
from merged n
