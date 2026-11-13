-- 歳出の木のノードを、科目の表（款・項・目）と内訳の表（科目の下）に振り分ける準備。
-- 科目は科目の軸（is_subject）かつ段が款・項・目のノード。軸の名前（科目・款項・款項目）では選ばない。
-- 内訳の枝の根（科目の直下）の見出しに、出典ごとの宣言 fiscal_detail_breakdown（見出し「節」は宣言が無ければ節）で分け方を付け、子孫へ継ぐ。
-- 子孫の見出しは宣言で引かない（132047 の事項の下の節は「事業」の枝の中の節）。
-- 行の ID は資料区分・補正号・node_id から作る（node_id は当初予算と決算で同じ値になるため）。
with recursive nodes as (
    select n.*,
        o.amendment_number,
        case n.document_kind when 'settlement' then 'executed' when 'initial' then 'approved' end as amount_phase,
        n.is_subject and n.node_kind in ('款', '項', '目') as is_subject_row,
        sha256(to_json([n.document_kind, o.amendment_number::varchar, n.node_id])) as row_id
    from {{ ref('int_fiscal__expenditure_nodes') }} n
    left join {{ source('fiscal_metadata', 'origin') }} o using (origin_id)
), heading as (
    select *, case when is_subject then '科目' else axis end as source_heading from nodes
), roots as (
    select c.node_id, c.document_kind, c.source_heading,
        p.row_id as subject_row_id,
        -- 見出しが「節」の枝は法定の節で分けたもの。宣言が無くても節とし、宣言があればそちらを使う
        coalesce(b.breakdown, case when c.source_heading = '節' then '節' end) as breakdown
    from heading c
    join heading p on p.node_id = c.parent_node_id and p.document_kind = c.document_kind and p.is_subject_row
    left join {{ ref('fiscal_detail_breakdown') }} b
        on b.jurisdiction_code = c.jurisdiction_code and b.fiscal_year = c.fiscal_year
        and b.document_kind = c.document_kind and b.source_heading = c.source_heading
    where not c.is_subject_row
), branch(node_id, document_kind, subject_row_id, breakdown, depth) as (
    select node_id, document_kind, subject_row_id, breakdown, 1 from roots
    union all
    select c.node_id, c.document_kind, b.subject_row_id, b.breakdown, b.depth + 1
    from branch b
    join nodes c on c.parent_node_id = b.node_id and c.document_kind = b.document_kind
)
select h.*,
    b.subject_row_id,
    b.breakdown,
    b.depth
from heading h
left join branch b using (node_id, document_kind)
