"""評価シートと事業のつながり（多対多、風土記の判断）。規則は ingestion/project/link_sheets.py の手順2・3。
人の判断（seed の evaluation_sheet_link）があるシートは、機械のつなぎ方を使わずその行にする。"""
import pyarrow as pa

from ingestion.project.link_sheets import LINE_COLUMNS, SHEET_COLUMNS, Line, link_projects, sheets_of


def model(dbt, session):
    dbt.config(materialized='table')
    sheets = sheets_of(dbt.ref('int_evaluation__sheets').project(SHEET_COLUMNS).fetchall())
    subjects: dict[str, dict[str, tuple[str, str]]] = {}
    for sheet_id, initial, settlement, method in dbt.ref('int_evaluation__sheet_subjects').project(
            'sheet_id, initial_expenditure_subject_id, settlement_expenditure_subject_id, method').fetchall():
        subjects[sheet_id] = {k: (s, method) for k, s in (('initial', initial), ('settlement', settlement)) if s}
    lines = [Line(*r) for r in dbt.ref('int_evaluation__sheet_lines').project(LINE_COLUMNS).fetchall()]
    overrides: dict[str, list[str | None]] = {}
    for sheet_id, detail_id in dbt.ref('int_evaluation__sheet_link_overrides').project('sheet_id, detail_id').fetchall():
        overrides.setdefault(sheet_id, []).append(detail_id)
    linked = link_projects(sheets, subjects, lines, overrides)
    return pa.table({
        'sheet_id': pa.array([r[0] for r in linked], pa.string()),
        'project_id': pa.array([r[1] for r in linked], pa.string()),
        'method': pa.array([r[2] for r in linked], pa.string()),
    })
