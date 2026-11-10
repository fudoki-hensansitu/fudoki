// 集約の型（*/model.ts）の enum と、dbt の accepted_values（columns.json）が同じ値かを照合する（docs/prd/aggregate-api/dd.md）。
import { describe, expect, test } from 'bun:test'
import { TABLES } from './columns'
import { EvaluationOriginType, Grade } from './evaluation/model'
import { z } from 'zod'
import { Breakdown, DetailRow, DocumentKind, LocationKind, LocationRow, OriginRow, SubjectRow } from './expenditure/model'
import { JurisdictionList } from './jurisdiction/model'

const values = (table: string, column: string) => {
  const spec = TABLES[table]?.columns.find((c) => c.name === column)
  if (!spec?.values) throw new Error(`${table}.${column} に accepted_values が無い`)
  return [...spec.values].sort()
}
const sorted = (xs: readonly string[]) => [...xs].sort()

describe('型と表の値', () => {
  test.each([
    ['expenditure', 'document_kind', DocumentKind.options],
    ['expenditure_subject', 'document_kind', DocumentKind.options],
    ['expenditure_detail', 'document_kind', DocumentKind.options],
    ['expenditure_detail', 'breakdown', Breakdown.options],
    ['expenditure_location', 'kind', LocationKind.options],
    ['evaluation', 'kind', ['with_result', 'sheets_only'] as const],
    ['evaluation_origin', 'document_type', EvaluationOriginType.options],
    ['evaluation_sheet', 'grade_code', Grade.options],
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
    ['expenditure_origin', shapeOf(OriginRow), true],
    // 一覧の要約は自治体マスタの全列と、組み立てた列（人口・収録範囲・年度）
    ['jurisdiction', jurisdiction, false],
  ] as const)('%s', (table, shape, exact) => {
    const columns = TABLES[table]!.columns
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
