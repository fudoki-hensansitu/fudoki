{# The raw CSV relations of one column layout. Each layout has its own staging model
   (stg_fiscal__csv_expenditure: 01会計… numbered cells; stg_fiscal__csv_named_expenditure:
   会計名称・款・款名称… code and name in separate columns). The layout is read from the loaded
   relation's columns; a relation that matches no layout stops the build. #}
{% macro fiscal_csv_layout_relations(layout) %}
    {% set found = [] %}
    {% for item in fiscal_csv_relations() %}
        {% set relation = ingestion_table(item['relation']) %}
        {% if execute %}
            {% set names = adapter.get_columns_in_relation(relation) | map(attribute='name') | list %}
            {% if '01会計' in names %}{% set kind = 'numbered' %}
            {% elif '会計名称' in names %}{% set kind = 'named' %}
            {% else %}{{ exceptions.raise_compiler_error('CSV relation without a known column layout: ' ~ item['relation']) }}
            {% endif %}
            {% if kind == layout %}{% do found.append(item) %}{% endif %}
        {% endif %}
    {% endfor %}
    {{ return(found) }}
{% endmacro %}
