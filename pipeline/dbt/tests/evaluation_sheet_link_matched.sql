-- 評価シートの上書きの seed（evaluation_sheet_link）の行が、シートと内訳に必ず当たる。
-- シートに当たらない行は、取り込みを直してシートの頁・位置がずれたもの。そのシートは機械のつなぎに戻るので、seed を直す。
-- detail_id が内訳に当たらない行は、そのシートのつなぎが黙って0件になる。
select k.*
from {{ ref('evaluation_sheet_link') }} k
left join {{ ref('int_evaluation__sheets') }} s
    on s.jurisdiction_code = k.jurisdiction_code and s.fiscal_year = k.fiscal_year
    and s.origin_id = k.origin_id and s.page = k.page and s.position = k.position
where (
        s.sheet_id is null
        or (
            nullif(k.detail_id, '') is not null
            and not exists (
                select 1 from {{ ref('int_evaluation__sheet_lines') }} l
                where l.detail_id = k.detail_id and l.jurisdiction_code = k.jurisdiction_code and l.fiscal_year = k.fiscal_year
            )
        )
    )
    and {{ only_jurisdictions('k.jurisdiction_code') }}
