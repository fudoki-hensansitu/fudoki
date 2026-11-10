// 集約の型（*/model.ts）の enum と、dbt の accepted_values（columns.json）が同じ値かを照合する（docs/prd/aggregate-api/dd.md）。
import { describe, expect, test } from 'bun:test'
import { TABLES } from './columns'
import { EvaluationOriginType, Grade } from './evaluation/model'
import { Breakdown, DocumentKind, LocationKind } from './expenditure/model'

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
