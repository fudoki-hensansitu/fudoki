-- W-1c で error に戻す。未対応目は report で当たり率を報告。
{{ config(severity='warn') }}
select n.node_id from {{ ref('int_fiscal__settlement_expenditure_nodes') }} n
left join {{ ref('int_fiscal__settlement_expenditure_cofog') }} c using (node_id, document_kind)
where n.is_subject and n.node_kind = '目'
  and (c.cofog_status is null or c.cofog_status not in ('assigned','tentative','unclassifiable','out-of-scope')
       or ((c.cofog_status in ('assigned','tentative')) <> (c.cofog_code is not null)))
