import { describe, expect, test } from 'bun:test'
import type { ColumnType } from './filter'
import { FilterError, compileFilter, parseFilter, requireScope } from './filter'

// 木の表の列（document_kind は表の列ではない）
const COLUMN_TYPES = new Map<string, ColumnType>(
  Object.entries({
    node_id: 'string', name: 'string', code: 'string', moku_code: 'string', cofog_code: 'string',
    latitude: 'number', fiscal_year: 'integer', amount_yen: 'integer', is_leaf: 'boolean',
  } as const)
)
const KINDS = ['settlement', 'initial']
const compile = (f: string) => compileFilter(parseFilter(f), COLUMN_TYPES)
const scope = (f: string) => requireScope(parseFilter(f), KINDS)

describe('parseFilter', () => {
  test('OR は AND より強く結ぶ', () => {
    const { sql } = compile('name = "x" AND code = "1" OR code = "2"')
    expect(sql).toBe('("name" = ? AND ("code" = ? OR "code" = ?))')
  })

  test('NOT と括弧', () => {
    expect(compile('NOT (name = "a" OR name = "b")').sql).toBe('(NOT ("name" = ? OR "name" = ?))')
  })

  test.each([
    ['has', 'name:"x"'],
    ['関数', 'prefix(name, "x")'],
    ['暗黙の AND', 'name = "a" code = "b"'],
    ['フィールドの辿り', 'a.b = 1'],
    ['空', '  '],
    ['閉じない文字列', 'name = "a'],
    ['閉じない括弧', '(name = "a"'],
  ])('%s は受け付けない', (_, f) => {
    expect(() => parseFilter(f)).toThrow(FilterError)
  })

  test('未許可の列は組み立てで弾く', () => {
    expect(() => compile('row_hash = "x"')).toThrow('filter に使えない列')
    expect(() => compile('document_kind = "settlement"')).toThrow(FilterError)
    expect(() => compile('foo = 1')).toThrow(FilterError)
  })
})

describe('compileFilter', () => {
  test('値は bind し SQL に連結しない', () => {
    const { sql, params } = compile(`name = "x' OR 1=1 --" AND fiscal_year = 2024`)
    expect(sql).toBe('("name" = ? AND "fiscal_year" = ?)')
    expect(params).toEqual(["x' OR 1=1 --", 2024])
    expect(sql).not.toContain('1=1')
  })

  test('ワイルドカードは GLOB で、特殊文字を escape する', () => {
    expect(compile('cofog_code = "04.5*"')).toEqual({ sql: '"cofog_code" GLOB ?', params: ['04.5*'] })
    expect(compile('name = "*[a]?*"')).toEqual({ sql: '"name" GLOB ?', params: ['*[[]a][?]*'] })
    expect(compile('name != "*市"')).toEqual({ sql: '"name" NOT GLOB ?', params: ['*市'] })
  })

  test('途中の * は 400（先頭か末尾だけがワイルドカード）', () => {
    expect(() => compile('name = "児*福祉費"')).toThrow('先頭か末尾')
    expect(() => compile('name = "a*b*"')).toThrow(FilterError)
    expect(() => compile('name > "a*b"')).toThrow(FilterError)
  })

  test('number は整数・小数・負数を受け、integer は小数を受けない', () => {
    expect(compile('latitude > 35.5').params).toEqual([35.5])
    expect(compile('latitude >= -139.25').params).toEqual([-139.25])
    expect(compile('latitude = 36').params).toEqual([36])
    expect(() => compile('latitude = "x"')).toThrow(FilterError)
    expect(() => compile('fiscal_year = 2024.5')).toThrow(FilterError)
    expect(compile('amount_yen > -5').params).toEqual([-5])
  })

  test('ワイルドカードは = と != だけ、* だけは不可', () => {
    expect(() => compile('name > "a*"')).toThrow(FilterError)
    expect(() => compile('name = "*"')).toThrow(FilterError)
  })

  test('型の検査と null', () => {
    expect(() => compile('fiscal_year = "x"')).toThrow(FilterError)
    expect(() => compile('is_leaf = 1')).toThrow(FilterError)
    expect(compile('is_leaf = true').params).toEqual([1])
    expect(compile('code = null').sql).toBe('"code" IS NULL')
    expect(compile('moku_code = 0101').params).toEqual(['0101'])
  })
})

describe('requireScope', () => {
  const base = 'document_kind = "settlement" AND '

  test('fiscal_year の三つの形', () => {
    expect(scope(base + 'fiscal_year = 2024')).toEqual({ documentKind: 'settlement', fiscalYears: [2024] })
    expect(scope(base + '(fiscal_year = 2024 OR fiscal_year = 2022)').fiscalYears).toEqual([2022, 2024])
    expect(scope(base + 'fiscal_year >= 2020 AND fiscal_year <= 2024').fiscalYears).toHaveLength(5)
    expect(scope('document_kind = "initial" AND fiscal_year > 2019 AND fiscal_year < 2023').fiscalYears).toEqual([
      2020, 2021, 2022,
    ])
  })

  test('= の OR は5つまで', () => {
    const six = [2019, 2020, 2021, 2022, 2023, 2024].map((y) => `fiscal_year = ${y}`).join(' OR ')
    expect(() => scope(`${base}(${six})`)).toThrow(FilterError)
    expect(() => scope(`${base}(${six.replace(' OR fiscal_year = 2024', '')})`)).not.toThrow()
  })

  test('範囲は幅5年以内で上下の両端が要る', () => {
    expect(() => scope(base + 'fiscal_year >= 2019 AND fiscal_year <= 2024')).toThrow(FilterError)
    expect(() => scope(base + 'fiscal_year >= 2019')).toThrow(FilterError)
  })

  test('document_kind は一つ、受け付ける値だけ', () => {
    expect(() => scope('fiscal_year = 2024')).toThrow(FilterError)
    expect(() => scope('document_kind = "supplementary" AND fiscal_year = 2024')).toThrow(FilterError)
    expect(() => scope('document_kind = "settlement" AND document_kind = "initial" AND fiscal_year = 2024')).toThrow(FilterError)
    expect(() => scope('document_kind = "settlement*" AND fiscal_year = 2024')).toThrow(FilterError)
  })

  test('NOT や OR の中の条件は数えない', () => {
    expect(() => scope('NOT document_kind = "settlement" AND fiscal_year = 2024')).toThrow(FilterError)
    expect(() => scope(base + 'NOT fiscal_year = 2024')).toThrow(FilterError)
    expect(() => scope(base + '(fiscal_year = 2024 OR name = "x")')).toThrow(FilterError)
    expect(() => scope('(document_kind = "settlement" OR name = "x") AND fiscal_year = 2024')).toThrow(FilterError)
  })
})
