"""評価シートごとの、同じ年度の当初予算書・決算書の目（風土記の判断）。規則は ingestion/project/link_sheets.py の手順1。"""
import pyarrow as pa

from ingestion.project.link_sheets import SHEET_COLUMNS, Subject, link_subjects, sheets_of


def model(dbt, session):
    dbt.config(materialized='table')
    sheets = sheets_of(dbt.ref('int_evaluation__sheets').project(SHEET_COLUMNS).fetchall())
    # 科目の表は根の値と所属する款・項・目を持たないので（ADR 0047）、根と int_fiscal__subject_path を JOIN する
    subject_rows = dbt.ref('expenditure_subject').join(dbt.ref('int_fiscal__subject_path'), 'subject_id').join(dbt.ref('expenditure'), 'expenditure_id')
    subjects = [Subject(*r) for r in subject_rows.filter(
        "level = '目' and amendment_number is null and document_kind in ('initial', 'settlement')").project(
        'subject_id, jurisdiction_code, fiscal_year, document_kind, account_name, account_kind, '
        'kan_code, kou_code, moku_code, kan_name, kou_name, moku_name').fetchall()]
    rows = [(sheet_id, kinds.get('initial', (None, None))[0], kinds.get('settlement', (None, None))[0],
             (kinds.get('settlement') or kinds['initial'])[1]) for sheet_id, kinds in link_subjects(sheets, subjects).items()]
    return pa.table({
        'sheet_id': pa.array([r[0] for r in rows], pa.string()),
        'initial_expenditure_subject_id': pa.array([r[1] for r in rows], pa.string()),
        'settlement_expenditure_subject_id': pa.array([r[2] for r in rows], pa.string()),
        'method': pa.array([r[3] for r in rows], pa.string()),
    })
