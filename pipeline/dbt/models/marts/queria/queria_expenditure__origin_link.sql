-- Queria に配る歳出の根と出典（冊）の組
select link_id, expenditure_id, origin_id
from {{ ref('expenditure_origin_link') }}
