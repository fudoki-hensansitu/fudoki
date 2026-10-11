{{ config(materialized='view') }}
select * from {{ ref('settlement_expenditure_node') }}
where is_subject and node_kind = '目'
