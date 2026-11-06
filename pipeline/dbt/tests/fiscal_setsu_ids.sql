-- Every 節-axis node carries a legal setsu ID; every other axis stays NULL by
-- design (備考・事業説明・CSV の科目などの節相当の名称は対象外).
select node_id from (select * from {{ ref('int_fiscal__expenditure_nodes') }} where document_kind = 'settlement')
where (axis = '節') <> (expenditure_setsu_id is not null)
union all
select node_id from (select * from {{ ref('int_fiscal__expenditure_nodes') }} where document_kind = 'initial')
where (axis = '節') <> (expenditure_setsu_id is not null)
