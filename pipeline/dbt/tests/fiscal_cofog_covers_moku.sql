-- 決算と当初予算の目を見る（int_fiscal__settlement_expenditure_nodes は両方の PDF の木を持つ）。
{{ config(severity='error') }}
select n.node_id from {{ ref('int_fiscal__settlement_expenditure_nodes') }} n
left join {{ ref('int_fiscal__settlement_expenditure_cofog') }} c using (node_id, document_kind)
where n.is_subject and n.node_kind = '目'
  and (c.cofog_status is null or c.cofog_status not in ('assigned','tentative','unclassifiable','out-of-scope')
       or ((c.cofog_status in ('assigned','tentative')) <> (c.cofog_code is not null)))
union all
select n.node_id from (select * from {{ ref('int_fiscal__expenditure_nodes') }} where document_kind = 'initial') n
where n.is_subject and n.node_kind = '目'
  and (n.cofog_status is null or n.cofog_status not in ('assigned','tentative','unclassifiable','out-of-scope')
       or ((n.cofog_status in ('assigned','tentative')) <> (n.cofog_code is not null)))
