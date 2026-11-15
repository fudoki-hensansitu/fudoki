-- 財政の資料（予算書・決算書）の出典の表。歳出と歳入は同じ冊に載るので1つの表を共有する。
select origin_id, jurisdiction_code, fiscal_year, document_kind, amendment_number,
    {{ trim_cell('title') }} as title, url, format, sha256
from {{ source('fiscal_metadata', 'origin') }}
