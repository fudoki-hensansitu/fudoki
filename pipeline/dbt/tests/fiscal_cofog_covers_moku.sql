select n.node_id from {{ ref('int_fiscal__settlement_expenditure_nodes') }} n
left join {{ ref('int_fiscal__settlement_expenditure_cofog') }} c using (node_id)
where n.axis = '科目' and n.node_kind = '目'
  and (c.cofog_status is null or c.cofog_status not in ('assigned','unclassifiable','out-of-scope')
       or ((c.cofog_status = 'assigned') <> (c.cofog_code is not null)))
