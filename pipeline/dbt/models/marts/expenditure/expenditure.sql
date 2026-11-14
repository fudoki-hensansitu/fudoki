-- 歳出の根: 一つの資料（自治体・年度・資料区分・補正号）の一つの会計。科目の表か内訳の表に行があるものだけ。
-- 出典の選定結果は使わない（選定しても表に行が無ければ検索で返らない）。
-- 総額と COFOG の大分類ごとの額は、科目の表の末端の行（is_leaf: 目と、目の無い項）を足したもの。自治体をまたいで比べる（まち比べの似たまち）のに使う。
-- 科目の表に行の無い根（内訳の表だけ）は NULL。
with roots as (
    select distinct expenditure_id, jurisdiction_code, fiscal_year, document_kind, amendment_number, account_name, account_kind
    from (
        select expenditure_id, jurisdiction_code, fiscal_year, document_kind, amendment_number, account_name, account_kind
        from {{ ref('expenditure_subject') }}
        union
        select expenditure_id, jurisdiction_code, fiscal_year, document_kind, amendment_number, account_name, account_kind
        from {{ ref('expenditure_detail') }}
    )
),

leaves as (
    select expenditure_id, amount_yen, split_part(cofog_code, '.', 1) as division
    from {{ ref('expenditure_subject') }}
    where is_leaf
),

totals as (
    select expenditure_id,
        sum(amount_yen) as total_yen,
        {%- for d in ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'] %}
        coalesce(sum(amount_yen) filter (where division = '{{ d }}'), 0) as cofog_{{ d }}_yen,
        {%- endfor %}
        coalesce(sum(amount_yen) filter (where division is null or division = ''), 0) as cofog_unclassified_yen
    from leaves
    group by expenditure_id
)

select r.*, t.total_yen,
    {%- for d in ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'] %}
    t.cofog_{{ d }}_yen,
    {%- endfor %}
    t.cofog_unclassified_yen
from roots r
left join totals t using (expenditure_id)
