-- 科目の表の足し方の規則: 同じ資料で、款の和 = is_leaf の科目の和。
-- 例外は所属の冊（ADR 0030）が目を立てずに印字した項の分（281000 福祉局の2款1項 総務費 170,000円）。
-- その分の一部（役務費 132,000円）は内訳の表に is_subject_remainder として入るが、残りは冊をまたいで
-- 足すノードが無いので内訳にも無い。ここでは旧い会計の合計の検査と同じく、取り込みの行から項の分を足す。
-- 出典が子を全部は印字しない款・項（132012 の主要な施策の成果報告書は主要な施策の無い項を載せない）は、
-- レイアウトの宣言（source_inconsistencies）の差を足す（fiscal_account_totals と同じく決算だけ）。
-- 予算書の宣言は頁をまたぐ款・項の頁の中の差（132080 の当初の民生費）で、子は次の頁に印字されているので足さない。
with settlement_nodes as (
    select * from {{ ref('int_fiscal__expenditure_nodes') }} where document_kind = 'settlement' and is_subject
), child_sums as (
    select parent_node_id as node_id, sum(amount_yen) as amount from settlement_nodes group by 1
), declared_gaps as (
    -- The gap absorbed is what the assembled tree still lacks under the declared parent, not the declared
    -- difference: a declaration also covers a parent whose children continue in the next volume or page
    -- (131211 2024, 132241 2020: `continued_rows` puts them back under the same parent), and those add up.
    select n.jurisdiction_code, n.fiscal_year, n.document_kind, n.account_name,
        sum(n.amount_yen - coalesce(c.amount, 0)) as amount
    from settlement_nodes n
    left join child_sums c on c.node_id = n.node_id
    where n.node_kind in ('款', '項') and n.amount_yen > coalesce(c.amount, 0)
      and exists (
        select 1 from {{ source('fiscal_metadata', 'source_inconsistencies') }} d
        where d.document_kind = n.document_kind and d.jurisdiction_code = n.jurisdiction_code
          and d.fiscal_year = n.fiscal_year and d.account_name = n.account_name and d.page = n.source_page
          and d.parent_code is not distinct from n.code and d.parent_name = n.name and d.printed_yen = n.amount_yen
          and d.children_sum_yen < d.printed_yen and d.axis = n.axis)
    group by all
), doc as (
    select e.jurisdiction_code, e.fiscal_year, e.document_kind, e.account_name,
        sum(s.amount_yen) filter (where s.level = '款') as kan_sum,
        sum(s.amount_yen) filter (where sp.is_leaf) as leaf_sum
    from {{ ref('expenditure_subject') }} s
    join {{ ref('expenditure') }} e using (expenditure_id)
    join {{ ref('int_fiscal__subject_path') }} sp using (subject_id)
    group by all
), rows as (
    select * from {{ ref('int_fiscal__rows') }} where direction = 'expenditure'
), division_kou_without_moku as (
    select k.jurisdiction_code, k.fiscal_year, 'settlement' as document_kind, k.account_name, sum(k.amount_yen) as amount
    from rows k
    where k.division is not null and k.node_kind = '項' and k.axis_header = k.subject_axis
      and not exists (select 1 from rows m where m.source_table_key = k.source_table_key
                      and m.parent_node_key = k.node_key and m.node_kind = '目')
      -- 統合後に末端（is_leaf）になった項は leaf_sum に入っているので足さない
      and not exists (select 1 from {{ ref('expenditure_subject') }} s
                      join {{ ref('expenditure') }} e using (expenditure_id)
                      join {{ ref('int_fiscal__subject_path') }} sp using (subject_id)
                      where s.node_key = k.node_id and e.document_kind = 'settlement' and sp.is_leaf)
    group by all
)
select doc.jurisdiction_code || ':' || doc.fiscal_year || ':' || doc.document_kind || ':' || doc.account_name as key,
    kan_sum as expected, leaf_sum + coalesce(d.amount, 0) + coalesce(g.amount, 0) as actual
from doc
left join division_kou_without_moku d using (jurisdiction_code, fiscal_year, document_kind, account_name)
left join declared_gaps g using (jurisdiction_code, fiscal_year, document_kind, account_name)
where kan_sum <> leaf_sum + coalesce(d.amount, 0) + coalesce(g.amount, 0)
