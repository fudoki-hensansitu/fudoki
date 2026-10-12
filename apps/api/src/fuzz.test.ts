import { describe, expect, test } from 'bun:test'
import { createApp } from './app'
import { ApiError } from './errors'
import { decodeToken, operations } from './operations'
import { MAX_BINDS, countBinds, searchInput } from './search'
import { insertNode, testDb } from './testing'

// 固定した種の乱数で、ランダムな JSON を schema・handler・REST に当てる。
// 結果が「400 か正常」のどちらかになり、想定外の例外・500・長い停止が出ないことを確かめる。

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = <T>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!

const columns = ['name', 'code', 'node_kind', 'cofog_code', 'amount_yen', 'is_leaf', 'fiscal_year', 'document_kind', 'row_hash', 'axis', '__proto__', 'constructor', '']
const ops = ['eq', 'not_eq', 'prefix', 'suffix', 'contains', 'min', 'max', 'is_null', 'like', '__proto__']
const strings = ['', 'a', '目', '庁*', '*', '[', '?', "' OR 1=1 --", '"', '\\', '\u0000', '\ud800', '😀', 'x'.repeat(201), 'NaN', 'Infinity', '-0', '1e999']
const numbers = [0, -0, 1, -1, 2024, 9999, 10000, 0.5, 1.5, 1e20, -1e20, 9007199254740991, 9007199254740993, Number.MAX_VALUE, 5e-324]

function randomValue(r: () => number, depth: number): unknown {
  const k = depth > 4 ? Math.floor(r() * 5) : Math.floor(r() * 8)
  switch (k) {
    case 0: return pick(r, strings)
    case 1: return pick(r, numbers)
    case 2: return r() < 0.5
    case 3: return null
    case 4: return pick(r, ['NaN', 'Infinity', '-Infinity', '1e999', '９'])
    case 5: return Array.from({ length: Math.floor(r() * (r() < 0.1 ? 150 : 4)) }, () => randomValue(r, depth + 1))
    default: return Object.fromEntries(Array.from({ length: Math.floor(r() * 4) }, () => [pick(r, [...columns, ...ops]), randomValue(r, depth + 1)]))
  }
}

/** 形に近いが壊れた入力 */
function randomQuery(r: () => number): unknown {
  const cond = () => Object.fromEntries(Array.from({ length: Math.floor(r() * 3) }, () => [pick(r, ops), randomValue(r, 3)]))
  const q: Record<string, unknown> = {
    document_kind: r() < 0.8 ? pick(r, ['settlement', 'initial']) : randomValue(r, 3),
    fiscal_year: r() < 0.8 ? { min: pick(r, numbers), max: pick(r, numbers) } : randomValue(r, 3),
  }
  if (r() < 0.7) q.where = Object.fromEntries(Array.from({ length: Math.floor(r() * 4) }, () => [pick(r, columns), cond()]))
  if (r() < 0.4) q.order_by = Array.from({ length: Math.floor(r() * 7) }, () => ({ column: pick(r, columns), desc: r() < 0.5 ? r() < 0.5 : randomValue(r, 4) }))
  if (r() < 0.3) q.page_size = pick(r, [...numbers, 'x', null])
  if (r() < 0.2) q.page_token = pick(r, [...strings, 'a'.repeat(600)])
  if (r() < 0.1) q[pick(r, ['filter', 'foo', '__proto__'])] = randomValue(r, 3)
  return q
}

/** schema を通る入力（条件の型・個数・文字列はランダム） */
function validQuery(r: () => number): unknown {
  const text = () => pick(r, ['', 'a', '庁*', '*', '[', '?', "' OR 1=1 --", '"', '目', '10.4']) || 'x'
  const list = <T>(f: () => T) => Array.from({ length: 1 + Math.floor(r() * 4) }, f)
  const str = (): Record<string, unknown> => ({ ...(r() < 0.4 && { eq: list(text) }), ...(r() < 0.3 && { not_eq: list(text) }), ...(r() < 0.3 && { prefix: text() }), ...(r() < 0.3 && { suffix: text() }), ...(r() < 0.3 && { contains: text() }), ...(r() < 0.2 && { is_null: r() < 0.5 }) })
  const int = (): Record<string, unknown> => ({ ...(r() < 0.4 && { eq: list(() => Math.floor(r() * 3000) - 5) }), ...(r() < 0.3 && { min: Math.floor(r() * 100) - 50 }), ...(r() < 0.3 && { max: Math.floor(r() * 100) }), ...(r() < 0.2 && { is_null: r() < 0.5 }) })
  const where: Record<string, unknown> = {}
  for (const [col, make] of [['name', str], ['code', str], ['node_kind', str], ['cofog_code', str], ['amount_yen', int]] as const) {
    const c = make()
    if (r() < 0.5 && Object.keys(c).length > 0) where[col] = c
  }
  if (r() < 0.3) where.is_leaf = { eq: r() < 0.5 }
  const min = 2015 + Math.floor(r() * 10)
  return {
    document_kind: pick(r, ['settlement', 'initial']),
    fiscal_year: { min, max: min + Math.floor(r() * 5) },
    where,
    order_by: Array.from({ length: Math.floor(r() * 4) }, () => ({ column: pick(r, ['name', 'amount_yen', 'node_id', 'axis', 'code']), desc: r() < 0.5 })).filter((k, i, a) => a.findIndex((x) => x.column === k.column) === i),
    page_size: 1 + Math.floor(r() * 50),
  }
}

const COUNT = 3000
const search = operations.find((o) => o.name === 'search_expenditure_nodes')!

describe('schema の fuzz', () => {
  test('ランダムな JSON と壊れた問い合わせで schema が例外を出さない', () => {
    const r = rng(11)
    const started = performance.now()
    let ok = 0
    for (let i = 0; i < COUNT * 2; i++) {
      const input = i % 2 === 0 ? randomValue(r, 0) : randomQuery(r)
      const result = searchInput.safeParse(input)
      if (result.success) {
        ok++
        expect(countBinds(result.data.where as never)).toBeLessThanOrEqual(MAX_BINDS)
        expect(result.data.fiscal_year.max - result.data.fiscal_year.min).toBeLessThan(5)
      }
    }
    expect(ok).toBeGreaterThan(0)
    expect(performance.now() - started).toBeLessThan(5000)
  })

  test('巨大な配列・深い入れ子・巨大な数でも schema が終わる', () => {
    const deep = (n: number) => Array.from({ length: n }).reduce<unknown>((acc) => [acc], 1)
    const started = performance.now()
    const base = { document_kind: 'settlement', fiscal_year: { min: 2024, max: 2024 } }
    for (const input of [
      deep(3000),
      { ...base, where: { name: { eq: Array.from({ length: 100000 }, () => 'a') } } },
      { ...base, order_by: Array.from({ length: 100000 }, () => ({ column: 'name' })) },
      { ...base, fiscal_year: { min: -1e308, max: 1e308 } },
      { ...base, where: deep(2000) },
    ])
      expect(() => searchInput.safeParse(input)).not.toThrow()
    expect(performance.now() - started).toBeLessThan(3000)
  })
})

describe('handler の fuzz', () => {
  test('schema を通った入力は正常に終わるか ApiError だけ', async () => {
    const { db, sqlite } = testDb()
    insertNode(sqlite, { document_kind: 'settlement', node_id: 'a'.repeat(64), node_kind: '目', name: '庁舎', amount_yen: 5, is_leaf: 1 })
    const r = rng(12)
    const started = performance.now()
    let ran = 0
    for (let i = 0; i < COUNT; i++) {
      const parsed = searchInput.safeParse(i % 2 === 0 ? validQuery(r) : randomQuery(r))
      if (!parsed.success) continue
      ran++
      try {
        await search.run({ db }, parsed.data)
      } catch (e) {
        if (!(e instanceof ApiError)) throw new Error(`想定外の例外 ${String(e)} / 入力: ${JSON.stringify(parsed.data)}`)
      }
    }
    expect(ran).toBeGreaterThan(1000)
    expect(performance.now() - started).toBeLessThan(5000)
  })
})

describe('REST の fuzz', () => {
  test('body が何でも 400 か 200（500 にならない）', async () => {
    const { db } = testDb()
    const app = createApp()
    const r = rng(13)
    const bodies: string[] = [
      '', 'null', 'true', '1', '"x"', '[]', '{}', '{', '{"a":', '[' .repeat(8000), '{"a":'.repeat(2000) + '1' + '}'.repeat(2000), '\u0000', '\ud800',
      JSON.stringify(randomQuery(r)).replace(/"/g, "'"),
    ]
    for (let i = 0; i < 1500; i++) bodies.push(JSON.stringify(i % 3 === 0 ? randomValue(r, 0) : randomQuery(r)))
    const started = performance.now()
    for (const body of bodies) {
      const res = await app.request('/v1/expenditure/nodes:search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, { DB: db })
      expect([200, 400, 413], body.slice(0, 120)).toContain(res.status)
      if (res.status !== 200) expect((await res.json()).error.code).toBe('INVALID_ARGUMENT')
    }
    expect(performance.now() - started).toBeLessThan(8000)
  })
})

describe('page_token の fuzz', () => {
  const b64 = (s: string) => btoa(s).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
  test('例外は ApiError だけ', async () => {
    const r = rng(5)
    const randomText = () =>
      Array.from({ length: Math.floor(r() * 80) }, () => String.fromCharCode(r() < 0.7 ? 32 + Math.floor(r() * 95) : Math.floor(r() * 0x10000))).join('')
    const json = ['null', '1', '"x"', '[]', '{}', '{"o":-1,"h":"x"}', '{"o":1.5}', '{"o":1e999}', '{"o":0,"h":null}', '{"o":9007199254740993,"h":"a"}', '{"o":1,"h":"a"', '[1,2']
    const inputs = [
      ...Array.from({ length: 3000 }, randomText),
      ...Array.from({ length: 3000 }, () => b64(r() < 0.5 ? pick(r, json) : randomText().replace(/[^\x00-\xff]/g, '?'))),
      ...json.map(b64),
      '', '=', '%', '-_-_', 'a'.repeat(100000),
    ]
    const started = performance.now()
    for (const token of inputs) {
      try {
        await decodeToken(token, ['search', '{}'])
      } catch (e) {
        if (!(e instanceof ApiError)) throw new Error(`想定外の例外 ${String(e)} / 入力: ${JSON.stringify(token.slice(0, 80))}`)
      }
    }
    expect(performance.now() - started).toBeLessThan(5000)
  })
})
