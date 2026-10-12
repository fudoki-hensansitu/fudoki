import { describe, expect, test } from 'bun:test'
import { NODE_TABLES } from './columns'
import { FilterError, compileFilter, parseFilter, requireScope } from './filter'
import { ApiError } from './errors'
import { decodeToken, parseOrderBy, withoutKindTerm } from './operations'

// 固定した種の乱数で、入力が「想定した 400」か「正常な戻り値」のどちらかになり、
// それ以外の例外・無限ループが出ないことを確かめる。

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

const types = NODE_TABLES.get('settlement')!.types
const fields = ['document_kind', 'fiscal_year', 'name', 'amount_yen', 'is_leaf', 'cofog_code', 'node_kind', 'row_hash', 'a.b', '']
const pieces = [
  ...fields,
  '=', '!=', '<', '<=', '>', '>=', ':', '~', '==', '=>', 'AND', 'OR', 'NOT', 'and', '-', '--',
  '(', ')', '((', '))', '"', "'", '\\', '"\\', '*', '**', '"*"', '"a*b"', '"*a*"',
  'settlement', 'initial', '"settlement"', '"initial"', 'true', 'false', 'null',
  '0', '-1', '2024', '9999', '10000', '100000000000000000000', '-100000000000000000000', '1.5', '-0.5', '1e5', '1e400', '0x10', '٣',
  ' ', '  ', '\t', '\n', '\u0000', '\u0007', '\ud800', '\udc00', '😀', '全角　空白', '庁舎',
]

const generate = (r: () => number) => {
  const n = 1 + Math.floor(r() * 14)
  let out = ''
  for (let i = 0; i < n; i++) out += pieces[Math.floor(r() * pieces.length)]! + (r() < 0.7 ? ' ' : '')
  return out
}
const randomText = (r: () => number) => {
  const n = Math.floor(r() * (r() < 0.05 ? 5000 : 80))
  let out = ''
  for (let i = 0; i < n; i++) out += String.fromCharCode(r() < 0.7 ? 32 + Math.floor(r() * 95) : Math.floor(r() * 0x10000))
  return out
}

const COUNT = 4000
const run = (fn: (input: string) => unknown, inputs: string[]) => {
  const started = performance.now()
  let ok = 0
  for (const input of inputs) {
    try {
      fn(input)
      ok++
    } catch (e) {
      if (!(e instanceof FilterError)) throw new Error(`想定外の例外 ${String(e)} / 入力: ${JSON.stringify(input)}`)
    }
  }
  expect(performance.now() - started).toBeLessThan(5000)
  return ok
}

const pipeline = (input: string) => {
  const expr = parseFilter(input)
  requireScope(expr, ['settlement', 'initial'])
  compileFilter(withoutKindTerm(expr), types) // 本番と同じく document_kind の項は SQL に入れない
}

describe('filter の fuzz', () => {
  test('トークンの組み合わせ', () => {
    const r = rng(1)
    const inputs = Array.from({ length: COUNT }, () => generate(r))
    run((i) => parseFilter(i), inputs)
    run((i) => compileFilter(parseFilter(i), types), inputs)
    run(pipeline, inputs)
  })

  test('有効な骨組みに、有効な項と壊れた項を混ぜる', () => {
    const r = rng(2)
    const base = 'document_kind = "settlement" AND fiscal_year >= 2022 AND fiscal_year <= 2024'
    const valid = ['name = "庁舎*"', 'NOT is_leaf = true', '(amount_yen > -5 OR name != "*費")', 'cofog_code = null', 'fiscal_year != 2023']
    const inputs = Array.from({ length: COUNT }, () => {
      const parts = Array.from({ length: Math.floor(r() * 4) }, () => (r() < 0.5 ? valid[Math.floor(r() * valid.length)]! : generate(r)))
      return [base, ...parts].join(' AND ')
    })
    expect(run(pipeline, inputs)).toBeGreaterThan(0)
  })

  test('完全にランダムな文字列と 2,000 文字超', () => {
    const r = rng(3)
    const inputs = Array.from({ length: COUNT }, () => randomText(r))
    inputs.push('a'.repeat(2001), '('.repeat(5000), 'NOT '.repeat(5000) + 'name = "x"', '"'.repeat(3000))
    run(pipeline, inputs)
  })

  test('深い入れ子と大量の項でも固まらない', () => {
    run(pipeline, [
      '('.repeat(1000) + 'name = "x"' + ')'.repeat(1000),
      Array.from({ length: 200 }, () => 'name = "x"').join(' AND '),
      Array.from({ length: 200 }, () => 'name = "x"').join(' OR '),
    ])
  })

  test('巨大な年は 400 で、算術だけで終わる', () => {
    const huge = '9'.repeat(400)
    const base = 'document_kind = "settlement" AND '
    run(pipeline, [`${base}fiscal_year >= -${huge} AND fiscal_year <= ${huge}`, `${base}fiscal_year = ${huge}`])
    expect(() => pipeline(`${base}fiscal_year >= -${huge} AND fiscal_year <= ${huge}`)).toThrow(FilterError)
  })
})

describe('order_by の fuzz', () => {
  test('例外は ApiError だけ', () => {
    const r = rng(4)
    const words = ['amount_yen', 'name', 'node_id', 'desc', 'DESC', 'asc', ',', ' ', 'row_hash', 'document_kind', ';', '--', '"', 'a b c', '\u0000', '\ud800', '😀']
    const inputs = Array.from({ length: COUNT }, () =>
      r() < 0.5
        ? Array.from({ length: 1 + Math.floor(r() * 8) }, () => words[Math.floor(r() * words.length)]).join(r() < 0.5 ? ' ' : '')
        : randomText(r)
    )
    inputs.push(',,,,', ' , ', 'name,'.repeat(1000))
    let ok = 0
    for (const input of inputs) {
      try {
        const { sql } = parseOrderBy(input, types)
        expect(sql).toMatch(/^("[a-z_]+"( DESC)?)(, "[a-z_]+"( DESC)?)*$/)
        ok++
      } catch (e) {
        if (!(e instanceof ApiError)) throw new Error(`想定外の例外 ${String(e)} / 入力: ${JSON.stringify(input)}`)
      }
    }
    expect(ok).toBeGreaterThan(0)
  })
})

describe('page_token の fuzz', () => {
  const b64 = (s: string) => btoa(s).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
  test('例外は ApiError だけ', async () => {
    const r = rng(5)
    const json = ['null', '1', '"x"', '[]', '{}', '{"o":-1,"h":"x"}', '{"o":1.5}', '{"o":1e999}', '{"o":0,"h":null}', '{"o":9007199254740993,"h":"a"}', '{"o":1,"h":"a"', '[1,2']
    const inputs = [
      ...Array.from({ length: COUNT }, () => randomText(r)),
      ...Array.from({ length: COUNT }, () => b64(r() < 0.5 ? json[Math.floor(r() * json.length)]! : randomText(r).replace(/[^\x00-\xff]/g, '?'))),
      ...json.map(b64),
      '',
      '=',
      '%',
      '-_-_',
      'a'.repeat(100000),
    ]
    const started = performance.now()
    for (const token of inputs) {
      try {
        await decodeToken(token, ['list', 'f', 'o'])
      } catch (e) {
        if (!(e instanceof ApiError)) throw new Error(`想定外の例外 ${String(e)} / 入力: ${JSON.stringify(token.slice(0, 80))}`)
      }
    }
    expect(performance.now() - started).toBeLessThan(5000)
  })
})
