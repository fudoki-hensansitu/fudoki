-- 事業の1年度。当初予算と決算の事業の行を、seed（project_line）の事業ID で1行にまとめる。
-- marts の project（始めた年度・終えた年度・親）と project_year（年度ごとの行）の元にする。
-- 事業の行は資料ごとに1つ。金額は出典の金額で、事業の木では足さない（子の事業の額は親の額に含まれる）。
with lines as (
    select s.project_id, l.*
    from {{ ref('project_line') }} s
    join {{ ref('int_project__lines') }} l
        on l.jurisdiction_code = s.jurisdiction_code and l.fiscal_year = s.fiscal_year and l.document_kind = s.document_kind
        and l.account_name = s.account_name and l.kan_name = s.kan_name and l.kou_name = s.kou_name
        and l.moku_name = s.moku_name and l.path = s.path
)
select sha256(to_json(['project_year', project_id, fiscal_year::varchar])) as project_year_id,
    project_id, any_value(jurisdiction_code) as jurisdiction_code, fiscal_year,
    coalesce(max(name) filter (where document_kind = 'initial'), max(name)) as name,
    coalesce(max(account_name) filter (where document_kind = 'initial'), max(account_name)) as account_name,
    nullif(coalesce(max(kan_name) filter (where document_kind = 'initial'), max(kan_name)), '') as kan_name,
    nullif(coalesce(max(kou_name) filter (where document_kind = 'initial'), max(kou_name)), '') as kou_name,
    nullif(coalesce(max(moku_name) filter (where document_kind = 'initial'), max(moku_name)), '') as moku_name,
    max(detail_id) filter (where document_kind = 'initial') as initial_expenditure_detail_id,
    max(detail_id) filter (where document_kind = 'settlement') as settlement_expenditure_detail_id,
    max(subject_id) filter (where document_kind = 'initial') as initial_expenditure_subject_id,
    max(subject_id) filter (where document_kind = 'settlement') as settlement_expenditure_subject_id,
    max(amount_yen) filter (where document_kind = 'initial') as budget_yen,
    max(amount_yen) filter (where document_kind = 'settlement') as settled_yen
from lines
group by project_id, fiscal_year
