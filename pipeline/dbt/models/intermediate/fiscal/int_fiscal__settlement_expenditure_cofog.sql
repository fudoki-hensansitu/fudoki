-- MVP classifies subject moku nodes of every document kind; setsu-dependent rules await a finer grain.
-- Settlement and initial budgets share subject node_ids, so deduplicate before joining rules.
-- CSV trees live in their own intermediate; union them here so initial-budget 目 classify too.
with mokus as (
    select distinct node_id,
        {{ fiscal_match_text('jurisdiction_code') }} as jurisdiction_code,
        {{ fiscal_match_text('account_name') }} as fund_name,
        {{ fiscal_match_text('kan_name') }} as kan_name,
        {{ fiscal_match_text('kou_name') }} as kou_name,
        {{ fiscal_match_text('kan_code') }} as kan_code,
        {{ fiscal_match_text('name') }} as moku_name, '' as setsu_name
    from {{ ref('int_fiscal__settlement_expenditure_nodes') }}
    where is_subject and node_kind = '目'
    union all
    select node_id,
        {{ fiscal_match_text('jurisdiction_code') }} as jurisdiction_code,
        {{ fiscal_match_text('account_name') }} as fund_name,
        {{ fiscal_match_text('kan_name') }} as kan_name,
        {{ fiscal_match_text('kou_name') }} as kou_name,
        {{ fiscal_match_text('kan_code') }} as kan_code,
        {{ fiscal_match_text('name') }} as moku_name, '' as setsu_name
    from {{ ref('int_fiscal__csv_expenditure_nodes') }}
    where is_subject and node_kind = '目'
), rules as (
    select rule_id, priority, status, cofog_code, moku_mode, coalesce(tentative, false) as tentative,
    {% for col in ['applies_to', 'match_fund', 'match_kan', 'match_kou', 'match_kan_code', 'match_moku', 'match_setsu'] %}
        coalesce({{ fiscal_match_text(col) }}, '') as {{ col }}{% if not loop.last %},{% endif %}
    {% endfor %}
    from {{ ref('cofog_rules') }}
)
select m.node_id, r.rule_id, case when r.tentative and r.status = 'assigned' then 'tentative' else r.status end as cofog_status, r.cofog_code
from mokus m join rules r on
{% for rule_col, moku_col in [('applies_to', 'jurisdiction_code'), ('match_fund', 'fund_name'),
    ('match_kan', 'kan_name'), ('match_kou', 'kou_name'), ('match_kan_code', 'kan_code'),
    ('match_moku', 'moku_name'), ('match_setsu', 'setsu_name')] %}
    (r.{{ rule_col }} = '' or exists (
        select 1 from unnest(string_split(r.{{ rule_col }}, '|')) as options(option)
        where {% if rule_col == 'match_moku' %}
            case when r.moku_mode = 'contains' then contains(m.{{ moku_col }}, option)
                 else m.{{ moku_col }} = option end
        {% else %}m.{{ moku_col }} = option{% endif %}
    )){% if not loop.last %} and {% endif %}
{% endfor %}
-- Specific rules precede the shared dictionary, regardless of numeric priority.
qualify row_number() over (partition by m.node_id order by (r.applies_to = ''), r.priority) = 1
