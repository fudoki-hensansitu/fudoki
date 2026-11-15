"""評価シートを、同じ年度の予算書・決算書の目と事業の行につなぐ（風土記の判断）。

dbt の `int_evaluation__sheet_subjects`・`int_evaluation__sheet_projects`（Python model）が、build のたびに全部のシートに当てる。
手順は docs/prd/evaluation-model/dd.md の「つなぎ方」。

1. 目を決める。シートの会計・款・項・目の番号が、当初予算書・決算書それぞれで1つの目に当たればその目にする。
   番号が無ければ、会計・款・項・目の名前で同じことをする。会計は会計の種類（または名前の頭）で比べ、印字が無ければ全部の会計から探す。
2. 目が決まったら、その目の下の事業の行だけでシートの事業名を比べ、当たった行を全部つなぐ（所管課ごとの行は全部）。
   シートが予算科目の事業名（jigyo）を持つ様式は、その事業の子孫で事業名が当たる行、無ければ予算科目の事業の行につなぐ。
   所管課がシートの担当課に当たる行があれば、それだけに絞る。当たった行の子孫は外す（子の額は親に含まれる）。
3. 目が決まらないシートだけ、自治体・年度の中で事業名を比べ、1つの事業にだけ当たればつなぐ。
名前は link_projects.normalize で比べる。事業の番号（jigyo_code）は予算書の番号と別の体系なので使わない。
"""
from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass

from ingestion.project.link_projects import normalize

KINDS = ('initial', 'settlement')
# シートの会計の略記。会計の種類の語に直してから比べる
ACCOUNT_ALIASES = {'国保': '国民健康保険'}
# シートの担当課の欄で、複数の課を並べる区切り
DIVISION_SEPARATOR = re.compile(r'[・、,，/／\s]+')


@dataclass(frozen=True)
class Sheet:
    sheet_id: str
    jurisdiction_code: str
    fiscal_year: int
    name: str
    account: str | None
    kan: str | None
    kou: str | None
    moku: str | None
    jigyo: str | None
    kan_code: str | None
    kou_code: str | None
    moku_code: str | None
    divisions: tuple[str, ...]


@dataclass(frozen=True)
class Subject:
    subject_id: str
    jurisdiction_code: str
    fiscal_year: int
    document_kind: str
    account_name: str
    account_kind: str
    kan_code: str | None
    kou_code: str | None
    moku_code: str | None
    kan_name: str | None
    kou_name: str | None
    moku_name: str | None


@dataclass(frozen=True)
class Line:
    detail_id: str
    parent_detail_id: str | None
    subject_id: str
    jurisdiction_code: str
    fiscal_year: int
    account_name: str
    account_kind: str
    name: str
    department: str | None
    project_id: str


# int_evaluation__sheets から読む列（Sheet の順）
SHEET_COLUMNS = ('sheet_id, jurisdiction_code, fiscal_year, name, account_name, kan, kou, moku, jigyo, '
                 'kan_code, kou_code, moku_code, division, department')
# int_project__lines と事業ID・所管課・会計の種類を合わせて読む列（Line の順）
LINE_COLUMNS = ('detail_id, parent_detail_id, subject_id, jurisdiction_code, fiscal_year, account_name, account_kind, '
                'name, department, project_id')


def sheets_of(rows: list[tuple]) -> list[Sheet]:
    return [Sheet(*r[:12], divisions=divisions(r[12], r[13])) for r in rows]


def divisions(*texts: str | None) -> tuple[str, ...]:
    """シートの担当課・担当部の欄を課ごとに分ける。"""
    out: list[str] = []
    for text in texts:
        for piece in DIVISION_SEPARATOR.split(unicodedata.normalize('NFKC', text or '')):
            if piece and piece not in out:
                out.append(piece)
    return tuple(out)


def number(code: str | None) -> int | None:
    """番号を数にする（先頭の0を無視する）。数字でなければ None。"""
    text = unicodedata.normalize('NFKC', code or '').strip()
    return int(text) if text.isdigit() else None


def same_account(sheet_account: str | None, account_name: str, account_kind: str) -> bool:
    """シートの会計と科目の会計が同じか。印字が無ければどの会計とも同じとみなす（番号・名前が1つに当たるときだけ採る）。"""
    if not sheet_account:
        return True
    text = unicodedata.normalize('NFKC', sheet_account).strip()
    for short, word in ACCOUNT_ALIASES.items():
        if text.startswith(short):
            text = word + text[len(short):]
    return account_kind in text or account_name.startswith(text) or text.startswith(account_name)


def subject_matches(sheet: Sheet, subject: Subject) -> str | None:
    """シートの予算科目が目に当たれば、当て方（code・subject_name）。"""
    if not same_account(sheet.account, subject.account_name, subject.account_kind):
        return None
    codes = (number(sheet.kan_code), number(sheet.kou_code), number(sheet.moku_code))
    if all(c is not None for c in codes):
        return 'code' if codes == (number(subject.kan_code), number(subject.kou_code), number(subject.moku_code)) else None
    names = (sheet.kan, sheet.kou, sheet.moku)
    if all(names) and names == (subject.kan_name, subject.kou_name, subject.moku_name):
        return 'subject_name'
    return None


def link_subjects(sheets: list[Sheet], subjects: list[Subject]) -> dict[str, dict[str, tuple[str, str]]]:
    """シートごとに、資料（当初・決算）ごとの目（subject_id）と当て方。1つに当たったものだけ。"""
    by_year: dict[tuple, list[Subject]] = defaultdict(list)
    for s in subjects:
        by_year[s.jurisdiction_code, s.fiscal_year, s.document_kind].append(s)
    out: dict[str, dict[str, tuple[str, str]]] = {}
    for sheet in sheets:
        for kind in KINDS:
            hits = [(s.subject_id, m) for s in by_year[sheet.jurisdiction_code, sheet.fiscal_year, kind]
                    if (m := subject_matches(sheet, s))]
            if len(hits) == 1:
                out.setdefault(sheet.sheet_id, {})[kind] = hits[0]
    return out


def department_matches(line: Line, sheet: Sheet) -> bool:
    """行の所管課がシートの担当課のどれかに当たるか（シートは部まで書くことがあるので末尾で比べる）。"""
    if not line.department:
        return False
    for d in divisions(line.department):
        if any(piece.endswith(d) or d.endswith(piece) for piece in sheet.divisions):
            return True
    return False


def topmost(lines: list[Line], by_id: dict[str, Line]) -> list[Line]:
    """当たった行のうち、ほかの当たった行の子孫を外す。"""
    ids = {line.detail_id for line in lines}

    def has_matched_ancestor(line: Line) -> bool:
        parent = line.parent_detail_id
        while parent is not None:
            if parent in ids:
                return True
            parent = by_id[parent].parent_detail_id if parent in by_id else None
        return False

    return [line for line in lines if not has_matched_ancestor(line)]


def narrow_by_department(lines: list[Line], sheet: Sheet) -> list[Line]:
    matched = [line for line in lines if department_matches(line, sheet)]
    return matched or lines


def link_projects(sheets: list[Sheet], subjects: dict[str, dict[str, tuple[str, str]]], lines: list[Line],
                  overrides: dict[str, list[str | None]]) -> list[tuple[str, str, str]]:
    """(sheet_id, project_id, method) の行。overrides はシートごとの人の判断（内訳の detail_id、None はつながない）。"""
    by_id = {line.detail_id: line for line in lines}
    under: dict[str, list[Line]] = defaultdict(list)
    children: dict[str, list[Line]] = defaultdict(list)
    by_year: dict[tuple, list[Line]] = defaultdict(list)
    for line in lines:
        under[line.subject_id].append(line)
        if line.parent_detail_id:
            children[line.parent_detail_id].append(line)
        by_year[line.jurisdiction_code, line.fiscal_year].append(line)

    def descendants(roots: list[Line]) -> list[Line]:
        out, stack = [], list(roots)
        while stack:
            for child in children[stack.pop().detail_id]:
                out.append(child)
                stack.append(child)
        return out

    out: list[tuple[str, str, str]] = []
    for sheet in sheets:
        name = normalize(sheet.name)
        if sheet.sheet_id in overrides:
            found = [by_id[d] for d in overrides[sheet.sheet_id] if d and d in by_id]
            method = 'seed'
        elif (decided := subjects.get(sheet.sheet_id)):
            method = next(iter(decided.values()))[1]
            scope = [line for subject_id, _ in decided.values() for line in under[subject_id]]
            if sheet.jigyo:
                anchors = [line for line in scope if normalize(line.name) == normalize(sheet.jigyo)]
                found = [line for line in descendants(anchors) if normalize(line.name) == name] or anchors
            else:
                found = [line for line in scope if normalize(line.name) == name]
            found = topmost(narrow_by_department(found, sheet), by_id)
        else:
            method = 'name'
            scope = [line for line in by_year[sheet.jurisdiction_code, sheet.fiscal_year]
                     if same_account(sheet.account, line.account_name, line.account_kind) and normalize(line.name) == name]
            found = topmost(narrow_by_department(scope, sheet), by_id)
            if len({line.project_id for line in found}) != 1:
                found = []
        for project_id in sorted({line.project_id for line in found}):
            out.append((sheet.sheet_id, project_id, method))
    return out
