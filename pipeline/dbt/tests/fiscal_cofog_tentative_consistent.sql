-- Tentative is only meaningful on assigned rules (code present).
-- The intermediate maps tentative to cofog_status only when status is assigned,
-- so a misconfigured tentative flag elsewhere would be silently dropped.
select rule_id from {{ ref('cofog_rules') }}
where coalesce(tentative, false) and status <> 'assigned'
