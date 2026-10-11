{{ config(materialized='view') }}
select * from {{ ref('settlement_expenditure_node') }}
where axis = '科目' and node_kind = '目'
