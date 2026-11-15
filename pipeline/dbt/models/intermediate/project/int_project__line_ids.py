"""事業の行（int_project__lines）ごとの事業ID。つなぎ方は風土記の判断で、規則は ingestion/project/link_projects.py。
内訳の分け方を「事業」と宣言した自治体はすべて対象にし、build のたびに計算し直す（seed には置かない）。"""
import pyarrow as pa

from ingestion.project.link_projects import KEY, link


def model(dbt, session):
    dbt.config(materialized='table')
    lines = dbt.ref('int_project__lines')
    rows = lines.project(f'detail_id, parent_detail_id, {", ".join(KEY)}, name, print_order').fetchall()
    linked = link(rows)
    return pa.table({
        'detail_id': pa.array([x[0] for x in linked], pa.string()),
        'project_id': pa.array([x[1] for x in linked], pa.string()),
        'method': pa.array([x[2] for x in linked], pa.string()),
    })
