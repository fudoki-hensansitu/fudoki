-- 歳出の根: 一つの資料（自治体・年度・資料区分・補正号）の一つの会計。科目の表か内訳の表に行があるものだけ。
-- 出典の選定結果は使わない（選定しても表に行が無ければ検索で返らない）。
-- 総額は款の行の和（印字された会計の合計の行は無いので、款の和を会計の合計とする。tests/fiscal_account_totals.sql と同じ）。
-- COFOG の大分類ごとの額は末端の科目（is_leaf: 目と、目の無い項）の和で、分類の無いものは総額から分類した額を引いた残り
-- （目を立てずに印字された項の内訳など、末端の和に入らない額も残りに入る。ADR 0030）。自治体をまたいで比べる（まち比べ）のに使う。
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

kan as (
    select expenditure_id, sum(amount_yen) as total_yen
    from {{ ref('expenditure_subject') }}
    where level = '款'
    group by expenditure_id
),

leaves as (
    select expenditure_id,
        {%- for d in ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'] %}
        coalesce(sum(amount_yen) filter (where split_part(cofog_code, '.', 1) = '{{ d }}'), 0) as cofog_{{ d }}_yen{{ ',' if not loop.last }}
        {%- endfor %}
    from {{ ref('expenditure_subject') }}
    where is_leaf
    group by expenditure_id
),

totals as (
    select k.expenditure_id, k.total_yen,
        {%- for d in ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'] %}
        coalesce(l.cofog_{{ d }}_yen, 0) as cofog_{{ d }}_yen,
        {%- endfor %}
        k.total_yen
        {%- for d in ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'] %} - coalesce(l.cofog_{{ d }}_yen, 0){% endfor %} as cofog_unclassified_yen
    from kan k
    left join leaves l using (expenditure_id)
)

select r.*, t.total_yen,
    {%- for d in ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'] %}
    t.cofog_{{ d }}_yen,
    {%- endfor %}
    t.cofog_unclassified_yen
from roots r
left join totals t using (expenditure_id)
