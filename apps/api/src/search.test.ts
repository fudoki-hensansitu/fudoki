import { describe, expect, test } from 'bun:test'
import { NODE_TABLES } from './columns'
import { buildWhere, countBinds, globEscape } from './search'

const t = NODE_TABLES.get('settlement')!
const fy = { min: 2024, max: 2025 }

describe('buildWhere', () => {
  test('値は bind し、列名は表の列だけ', () => {
    const { sql, params } = buildWhere(t, fy, { name: { eq: ["x' OR 1=1 --", 'b'], prefix: 'p' }, amount_yen: { min: -5, max: 10 }, is_leaf: { eq: true } })
    expect(sql).toBe('"fiscal_year" IN (?, ?) AND "name" IN (?, ?) AND "name" GLOB ? AND "amount_yen" >= ? AND "amount_yen" <= ? AND "is_leaf" = ?')
    expect(params).toEqual([2024, 2025, "x' OR 1=1 --", 'b', 'p*', -5, 10, 1])
    expect(sql).not.toContain('1=1')
  })

  test('表に無い列・fiscal_year は 400', () => {
    expect(() => buildWhere(t, fy, { row_hash: { eq: ['x'] } })).toThrow()
    expect(() => buildWhere(t, fy, { fiscal_year: { min: 1 } })).toThrow()
    expect(() => buildWhere(t, fy, { 'name"; --': { eq: ['x'] } })).toThrow()
  })

})

describe('GLOB のパターンは生成後 50 バイトまで', () => {
  const pattern = (n: number) => 'a'.repeat(n)
  test('prefix は後ろの * を含めて数える', () => {
    expect(() => buildWhere(t, fy, { name: { prefix: pattern(49) } })).not.toThrow()
    expect(() => buildWhere(t, fy, { name: { prefix: pattern(50) } })).toThrow('50 バイト')
  })
  test('contains は前後の * を含めて数える', () => {
    expect(() => buildWhere(t, fy, { name: { contains: pattern(48) } })).not.toThrow()
    expect(() => buildWhere(t, fy, { name: { contains: pattern(49) } })).toThrow()
  })
  test('escape で増える分と UTF-8 のバイト数を数える', () => {
    expect(() => buildWhere(t, fy, { name: { prefix: '*'.repeat(16) } })).not.toThrow() // 16×3 + 1 = 49
    expect(() => buildWhere(t, fy, { name: { prefix: '*'.repeat(17) } })).toThrow() // 17×3 + 1 = 52
    expect(() => buildWhere(t, fy, { name: { prefix: '目'.repeat(16) } })).not.toThrow() // 16×3 + 1 = 49
    expect(() => buildWhere(t, fy, { name: { prefix: '目'.repeat(17) } })).toThrow()
  })
  test('eq は GLOB でないので長くてよい', () => {
    expect(() => buildWhere(t, fy, { name: { eq: [pattern(200)] } })).not.toThrow()
  })
})

test('globEscape は * ? [ だけを escape する', () => {
  expect(globEscape('a*b?c[d]e')).toBe('a[*]b[?]c[[]d]e')
})

test('countBinds は eq の個数と単独の値を数える', () => {
  expect(countBinds(fy, undefined)).toBe(2)
  expect(countBinds({ min: 2021, max: 2025 }, undefined)).toBe(5)
  expect(countBinds(fy, { name: { eq: ['a', 'b'], prefix: 'p', is_null: false }, is_leaf: { eq: true } })).toBe(2 + 2 + 1 + 1)
})
