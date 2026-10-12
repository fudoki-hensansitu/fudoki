-- 決算の intermediate の目と、当初予算の marts の目の両方を見る。CSV の
-- 当初予算の目も initial_expenditure_node に入るため、ここの対象に含める。
{{ config(severity='error') }}
select n.node_id from {{ ref('int_fiscal__settlement_expenditure_nodes') }} n
left join {{ ref('int_fiscal__settlement_expenditure_cofog') }} c using (node_id, document_kind)
where n.is_subject and n.node_kind = '目'
  and (c.cofog_status is null or c.cofog_status not in ('assigned','tentative','unclassifiable','out-of-scope')
       or ((c.cofog_status in ('assigned','tentative')) <> (c.cofog_code is not null)))
union all
select n.node_id from {{ ref('initial_expenditure_node') }} n
where n.is_subject and n.node_kind = '目'
  and (n.cofog_status is null or n.cofog_status not in ('assigned','tentative','unclassifiable','out-of-scope')
       or ((n.cofog_status in ('assigned','tentative')) <> (n.cofog_code is not null)))
