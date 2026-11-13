{# 取り込みの表（prepare.py が管理 JSON から ingestion schema に読み込む）。表ごとの source 宣言は持たない #}
{% macro ingestion_table(name) %}
    {{ return(api.Relation.create(database=target.database, schema='ingestion', identifier=name)) }}
{% endmacro %}
