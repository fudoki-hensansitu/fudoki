import { beforeEach, describe, expect, test } from 'bun:test'
import type { Database } from 'bun:sqlite'
import type { Db } from './db'
import { insertCoverage, insertJurisdiction, insertOrigin, testDb } from './testing'
import { callWebOp } from './web-ops'

// 歳出の根の額（web のまち比べの list_expenditures・list_similar_expenditures）
const AMOUNT_KEYS = ['total_yen', ...['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'].map((d) => `cofog_${d}_yen`), 'cofog_unclassified_yen']
const amounts = (total: number, c10: number, c09: number, rest: number) => ({ ...Object.fromEntries(AMOUNT_KEYS.map((k) => [k, 0])), total_yen: total, cofog_10_yen: c10, cofog_09_yen: c09, cofog_unclassified_yen: rest })
const NO_AMOUNTS = Object.fromEntries(AMOUNT_KEYS.map((k) => [k, null]))

let db: Db
let sqlite: Database
const call = async (name: string, input: Record<string, unknown>) => {
  const res = await callWebOp({ DB: db } as never, name, input)
  expect(res.ok).toBe(true)
  return (res as { value: Record<string, Record<string, unknown>[]> }).value
}

beforeEach(() => {
  ;({ db, sqlite } = testDb())
  insertJurisdiction(sqlite, { jurisdiction_code: '131016', name: '千代田区' })
  insertJurisdiction(sqlite, { jurisdiction_code: '132039', name: '武蔵野市' })
  insertJurisdiction(sqlite, { jurisdiction_code: '132063', name: '府中市' })
  insertJurisdiction(sqlite, { jurisdiction_code: '342076', name: '府中市', prefecture_name: '広島県' })
  insertJurisdiction(sqlite, { jurisdiction_code: '130001', name: '東京都' })
  insertOrigin(sqlite, { origin_id: 'o1', title: '決算書', url: 'https://example.test/o1.pdf', sha256: 'a' })
  insertOrigin(sqlite, { origin_id: 'o3', title: '予算書', url: 'https://example.test/o3.pdf', document_kind: 'initial', sha256: 'c' })
  // 武蔵野市は 10 が 4/7・09 が 2/7・分類なしが 1/7。千代田区は同じ割合で額が10倍、広島の府中市は 09 だけ。府中市（東京）は額が無い
  insertCoverage(sqlite, { jurisdiction_code: '132039', fiscal_year: 2024, document_kind: 'settlement', account_name: '国民健康保険事業会計', account_kind: '国民健康保険', origin_id: 'o1' })
  insertCoverage(sqlite, { jurisdiction_code: '132039', fiscal_year: 2024, document_kind: 'settlement', account_name: '一般会計', origin_id: 'o1', amounts: amounts(70_000, 40_000, 20_000, 10_000) })
  insertCoverage(sqlite, { jurisdiction_code: '132039', fiscal_year: 2024, document_kind: 'initial', account_name: '一般会計', origin_id: 'o3' })
  insertCoverage(sqlite, { jurisdiction_code: '131016', fiscal_year: 2024, document_kind: 'settlement', account_name: '一般会計', origin_id: 'o1', amounts: amounts(700_000, 400_000, 200_000, 100_000) })
  insertCoverage(sqlite, { jurisdiction_code: '342076', fiscal_year: 2024, document_kind: 'settlement', account_name: '一般会計', origin_id: 'o1', amounts: amounts(10_000, 0, 10_000, 0) })
  insertCoverage(sqlite, { jurisdiction_code: '132063', fiscal_year: 2024, document_kind: 'settlement', account_name: '一般会計', origin_id: 'o1' })
  insertCoverage(sqlite, { jurisdiction_code: '130001', fiscal_year: 2024, document_kind: 'settlement', account_name: '一般会計', origin_id: 'o1', amounts: amounts(70_000, 40_000, 20_000, 10_000) })
})

describe('比べる資料の歳出の根（list_expenditures）', () => {
  test('指定した資料の会計すべてを、一般会計を先に、総額と分野ごとの額つきで返す（同じ資料を2回指定しても1回）', async () => {
    const v = { jurisdiction_code: '132039', fiscal_year: 2024, document_kind: 'settlement' }
    const { expenditures } = await call('list_expenditures', { versions: [v, v, { jurisdiction_code: '131016', fiscal_year: 2023, document_kind: 'settlement' }] })
    expect(expenditures).toEqual([
      { ...v, account_name: '一般会計', account_kind: '一般会計', ...amounts(70_000, 40_000, 20_000, 10_000) },
      { ...v, account_name: '国民健康保険事業会計', account_kind: '国民健康保険', ...NO_AMOUNTS },
    ])
  })
})

describe('分野の割合が近いまち（list_similar_expenditures）', () => {
  const similar = async (input: Record<string, unknown>) => (await call('list_similar_expenditures', input)).expenditures!
  const base = { jurisdiction_code: '132039', fiscal_year: 2024, document_kind: 'settlement' }

  test('同じ年度・資料区分の一般会計で、割合の近い順に返す（自分・総額の無い会計・都道府県は除く）', async () => {
    expect(await similar(base)).toEqual([
      { jurisdiction_code: '131016', name: '千代田区', total_yen: 700_000 },
      { jurisdiction_code: '342076', name: '府中市', total_yen: 10_000 },
    ])
  })

  test('among を渡すとその中から、limit の数だけ返す', async () => {
    expect((await similar({ ...base, among: ['342076'] })).map((r) => r.jurisdiction_code)).toEqual(['342076'])
    expect(await similar({ ...base, limit: 1 })).toHaveLength(1)
  })

  test('比べる資料に総額が無ければ空', async () => {
    expect(await similar({ ...base, document_kind: 'initial' })).toEqual([])
  })
})
