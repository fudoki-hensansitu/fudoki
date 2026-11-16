// 集約の型（*/model.ts）の enum と、dbt の accepted_values（columns.json）が同じ値かを照合する（docs/prd/aggregate-api/dd.md）。
import { describe, expect, test } from 'bun:test'
import { DETAIL_TABLE, PROJECT_COLUMNS, PROJECT_YEAR_COLUMNS, REVENUE_SUBJECT_TABLE, SUBJECT_TABLE, TABLES, type ColumnSpec } from './columns'
import { DIRECTIONS, DirectionCode, EvaluationOriginRow, EvaluationRow, IndicatorRow, IndicatorValueRow, SheetRow } from './evaluation/model'
import { ProjectRow, ProjectYearRow } from './project/model'
import { z } from 'zod'
import { DocumentKind } from './shared/model'
import { Breakdown, DetailRow, LocationKind, LocationRow, OriginRow, SubjectRow } from './expenditure/model'
import { JurisdictionList } from './jurisdiction/model'
import { RevenueCategory, RevenueLocationRow, RevenueSubjectRow } from './revenue/model'

/** 科目・内訳は表に無い列も検索の中で求めて返すので（ADR 0047）、検索の対象の列と照合する */
// 表に無い列を JOIN で引く検索・事業は、その列の一覧と照合する
const VIEWS: Record<string, readonly ColumnSpec[]> = {
  expenditure_subject: SUBJECT_TABLE.columns,
  expenditure_detail: DETAIL_TABLE.columns,
  revenue_subject: REVENUE_SUBJECT_TABLE.columns,
  project: PROJECT_COLUMNS,
  project_year: PROJECT_YEAR_COLUMNS,
}
const columnsOfTable = (table: string) => VIEWS[table] ?? TABLES[table]!.columns

const values = (table: string, column: string) => {
  const spec = columnsOfTable(table).find((c) => c.name === column)
  if (!spec?.values) throw new Error(`${table}.${column} に accepted_values が無い`)
  return [...spec.values].sort()
}
const sorted = (xs: readonly string[]) => [...xs].sort()
/** 表の列に JOIN で引く列を足した API の行の列 */
describe('型と表の値', () => {
  test.each([
    ['expenditure', 'document_kind', DocumentKind.options],
    ['expenditure_subject', 'document_kind', DocumentKind.options],
    ['expenditure_detail', 'document_kind', DocumentKind.options],
    ['expenditure_detail', 'breakdown', Breakdown.options],
    ['revenue_subject', 'document_kind', DocumentKind.options],
    ['revenue_subject', 'category', RevenueCategory.options],
    ['expenditure_location', 'kind', LocationKind.options],
    ['evaluation_sheet', 'direction_code', DirectionCode.options],
    ['evaluation_sheet', 'direction_code', Object.keys(DIRECTIONS)],
  ] as const)('%s.%s', (table, column, options) => {
    expect(values(table, column)).toEqual(sorted(options))
  })
})

// API の行の schema（手で書いた zod）が、columns.json の列の集合・型・null の可否・accepted_values と合うか。
// 表の列を変えたら columns.json が変わり、ここで schema の書き直しを求める。

type Shape = Record<string, z.ZodType>
const shapeOf = (schema: z.ZodType) => (schema as unknown as { shape: Shape }).shape

/** zod の列の schema を columns.json の型の語彙にする */
function describeColumn(schema: z.ZodType): { type: string; nullable: boolean; values?: (string | number)[] } {
  let s = schema as z.ZodType & { def: { type: string; innerType?: z.ZodType; entries?: Record<string, string> } }
  let nullable = false
  if (s.def.type === 'nullable') {
    nullable = true
    s = s.def.innerType as typeof s
  }
  const t = s.def.type
  if (t === 'enum') return { type: 'string', nullable, values: Object.values(s.def.entries!).sort() }
  if (t === 'number') return { type: (s as unknown as z.ZodNumber).format === 'safeint' ? 'integer' : 'number', nullable }
  return { type: t, nullable }
}

describe('API の行の schema と表の列', () => {
  const jurisdiction = shapeOf((shapeOf(JurisdictionList).jurisdictions as unknown as z.ZodArray).element as z.ZodType)
  test.each([
    ['expenditure_subject', shapeOf(SubjectRow), true],
    ['expenditure_detail', shapeOf(DetailRow), true],
    ['expenditure_location', shapeOf(LocationRow), true],
    ['revenue_subject', shapeOf(RevenueSubjectRow), true],
    ['revenue_location', shapeOf(RevenueLocationRow), true],
    ['fiscal_origin', shapeOf(OriginRow), true],
    ['evaluation', shapeOf(EvaluationRow), true],
    ['evaluation_origin', shapeOf(EvaluationOriginRow), true],
    // シートは表の全列と、方向性の区分から組み立てた outlook
    ['evaluation_sheet', shapeOf(SheetRow), false],
    ['evaluation_indicator', shapeOf(IndicatorRow), true],
    ['evaluation_indicator_value', shapeOf(IndicatorValueRow), true],
    // 一覧の要約は自治体マスタの全列と、組み立てた列（収録範囲・年度）
    ['jurisdiction', jurisdiction, false],
    // 事業・事業の年度は表の列と、表に写さず JOIN で引く列
    ['project', shapeOf(ProjectRow), true],
    ['project_year', shapeOf(ProjectYearRow), true],
  ] as const)('%s', (table, shape, exact) => {
    const columns = columnsOfTable(table)
    if (exact) expect(Object.keys(shape).sort()).toEqual(columns.map((c) => c.name).sort())
    for (const c of columns) {
      const got = describeColumn(shape[c.name]!)
      expect({ column: c.name, ...got }).toEqual({
        column: c.name,
        type: c.type,
        nullable: c.nullable !== false,
        ...(c.values || got.values ? { values: [...(c.values ?? [])].sort() } : {}),
      })
    }
  })
})
