-- Stable published nodes must remain present and usable in comparisons.
with expected(node_id, expected_cofog, expected_recipient) as (
    values ('38957757dc1a68d3a380e4552c88fd4d36f5d8c89b7ca89cd562a0972bb041ab', '10.2', null),
           ('855a6a544f297d5e8b73830c261899edfa1cb020f33b73ca84e5a3383bd4ec2c', null, '介護保険')
)
select e.node_id
from expected e left join {{ ref('settlement_expenditure_node') }} n using (node_id)
where n.node_id is null
   or (e.expected_cofog is not null and n.cofog_code is distinct from e.expected_cofog)
   or (e.expected_recipient is not null and
       (not n.is_interfund_transfer or n.interfund_transfer_to is distinct from e.expected_recipient))
