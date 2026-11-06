-- 歳出の木（決算・当初予算、PDF と CSV）を資料区分つきで1つにする。marts はここから科目の表・内訳の表・
-- 印字の位置の表を作る。会計の種類と繰出の印・節の ID・COFOG は共有の intermediate から引く（ADR 0023）。
-- node_id は資料区分を含まない（同じ自治体・年度の当初予算と決算の同じ項目が同じ値）。
with unioned as (
    select n.* from {{ ref('int_fiscal__settlement_expenditure_nodes') }} n
    where n.document_kind in ('settlement', 'initial')
    union all
    select n.* from {{ ref('int_fiscal__csv_expenditure_nodes') }} n
    where n.document_kind in ('settlement', 'initial')
)
select u.*,
    c.cofog_status,
    c.cofog_code,
    t.account_kind,
    t.is_interfund_transfer,
    t.interfund_transfer_to,
    s.expenditure_setsu_id
from unioned u
left join {{ ref('int_fiscal__settlement_expenditure_cofog') }} c using (node_id, document_kind)
left join {{ ref('int_fiscal__expenditure_transfers') }} t using (node_id, document_kind)
left join {{ ref('int_fiscal__expenditure_setsu') }} s using (node_id, document_kind)
