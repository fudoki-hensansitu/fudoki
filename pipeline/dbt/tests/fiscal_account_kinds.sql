-- Every account carries a kind from the shared 5-term vocabulary, and every
-- identified transfer recipient does too. Unidentified recipients (他会計繰出金)
-- keep the mark with a NULL recipient instead of a guessed kind.
select node_id, 'bad_account_kind' as failure, account_kind as value
from {{ ref('settlement_expenditure_node') }}
where account_kind not in ('一般会計', '国民健康保険', '介護保険', '後期高齢者医療', 'その他')
union all
select node_id, 'bad_transfer_recipient', interfund_transfer_to
from {{ ref('settlement_expenditure_node') }}
where interfund_transfer_to is not null
  and interfund_transfer_to not in ('一般会計', '国民健康保険', '介護保険', '後期高齢者医療', 'その他')
union all
select node_id, 'transfer_mark_mismatch', interfund_transfer_to
from {{ ref('settlement_expenditure_node') }}
where is_interfund_transfer <> (is_subject and node_kind = '目' and regexp_matches(name, '^(.*)繰出金$'))
