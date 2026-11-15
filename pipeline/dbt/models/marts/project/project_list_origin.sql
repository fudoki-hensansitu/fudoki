-- 事業の一覧の資料の出典（予算書に事業名の無い自治体で、事業を作る資料）。PDF 1つが1行。
select origin_id, jurisdiction_code, fiscal_year, title, url, landing_url, sha256
from {{ source('project', 'project_list_origin') }}
