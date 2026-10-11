-- match_account_kind を書いた規則は account_kind_map の種類のどれかに一致する。
-- 種類の表記は辞書（account_kind_map）が正本で、ここに写さない。
-- 空（全種類に効く）は対象外。seed の空欄は NULL または '' で載る。
select r.rule_id, r.match_account_kind
from {{ ref('cofog_rules') }} r
where r.match_account_kind is not null and r.match_account_kind <> ''
  and r.match_account_kind not in (
      select account_kind from {{ ref('account_kind_map') }}
      where account_kind is not null and account_kind <> '')
