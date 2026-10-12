import { describe, expect, test } from 'bun:test'
import { NODE_TABLES } from './columns'
import { buildWhere, canonicalJson, countBinds, globEscape } from './search'

const t = NODE_TABLES.get('settlement')!
const fy = { min: 2024, max: 2025 }

describe('buildWhere', () => {
  test('値は bind し、列名は表の列だけ', () => {
    const { sql, params } = buildWhere(t, fy, { name: { eq: ["x' OR 1=1 --", 'b'], prefix: 'p' }, amount_yen: { min: -5, max: 10 }, is_leaf: { eq: true } })
    expect(sql).toBe('"fiscal_year" >= ? AND "fiscal_year" <= ? AND "name" IN (?, ?) AND "name" GLOB ? AND "amount_yen" >= ? AND "amount_yen" <= ? AND "is_leaf" = ?')
    expect(params).toEqual([2024, 2025, "x' OR 1=1 --", 'b', 'p*', -5, 10, 1])
    expect(sql).not.toContain('1=1')
  })

  test('is_null と not_eq と suffix・contains', () => {
    const { sql, params } = buildWhere(t, fy, { code: { is_null: false, not_eq: ['1'] }, name: { suffix: 'a', contains: 'b' }, cofog_code: { is_null: true } })
    expect(sql).toContain('"code" IS NOT NULL AND "code" NOT IN (?)')
    expect(sql).toContain('"cofog_code" IS NULL')
    expect(params).toEqual([2024, 2025, '1', '*a', '*b*'])
  })

  test('表に無い列・fiscal_year は 400', () => {
    expect(() => buildWhere(t, fy, { row_hash: { eq: ['x'] } })).toThrow()
    expect(() => buildWhere(t, fy, { fiscal_year: { min: 1 } })).toThrow()
    expect(() => buildWhere(t, fy, { 'name"; --': { eq: ['x'] } })).toThrow()
  })

  test('where が無ければ年度だけ', () => {
    expect(buildWhere(t, fy, undefined)).toEqual({ sql: '"fiscal_year" >= ? AND "fiscal_year" <= ?', params: [2024, 2025] })
  })
})

test('globEscape は * ? [ だけを escape する', () => {
  expect(globEscape('a*b?c[d]e')).toBe('a[*]b[?]c[[]d]e')
})

test('countBinds は eq の個数と単独の値を数える', () => {
  expect(countBinds(undefined)).toBe(2)
  expect(countBinds({ name: { eq: ['a', 'b'], prefix: 'p', is_null: false }, is_leaf: { eq: true } })).toBe(2 + 2 + 1 + 1)
})

test('canonicalJson はキーの順に依らない', () => {
  expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: undefined } })).toBe(canonicalJson({ a: { c: undefined, d: [1, { y: 2, z: 1 }] }, b: 1 }))
})
