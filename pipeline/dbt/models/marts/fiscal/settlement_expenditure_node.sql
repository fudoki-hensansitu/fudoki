select n.* exclude (kan_name, kou_name), c.cofog_status, c.cofog_code
from {{ ref('int_fiscal__settlement_expenditure_nodes') }} n
left join {{ ref('int_fiscal__settlement_expenditure_cofog') }} c using (node_id)
