import { beforeEach, describe, expect, test } from 'bun:test'
import type { Database } from 'bun:sqlite'
import type { Db } from './db'
import { insertOrigin, testDb } from './testing'
import { RevenueOutput } from './revenue/model'
import { callWebOp } from './web-ops'

// 歳入の根・款・区分（get_revenue）。款の和が総額で、区分は款の名前で辞書を引く
let db: Db
let sqlite: Database
const call = async (input: Record<string, unknown>) => {
  const res = await callWebOp({ DB: db } as never, 'get_revenue', input)
  expect(res.ok).toBe(true)
  return RevenueOutput.parse((res as { value: unknown }).value)
}
const insert = (table: string, row: Record<string, unknown>) =>
  sqlite.query(`INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`).run(...(Object.values(row) as never[]))

function root(id: string, year: number, kind: string, account: string, total: number, kan: [string, string, number][]) {
  insert('revenue', { revenue_id: id, jurisdiction_code: '131091', fiscal_year: year, document_kind: kind, amendment_number: null, account_name: account, account_kind: account, total_yen: total })
  insert('revenue_origin_link', { link_id: `${id}-o`, revenue_id: id, origin_id: kind === 'initial' ? 'o-initial' : 'o-settlement' })
  for (const [code, name, yen] of kan) {
    const sid = `${id}-${code}`
    insert('revenue_subject', { subject_id: sid, node_key: sid, parent_subject_id: null, revenue_id: id, level: '款', code, name, amount_yen: yen, origin_id: 'o-initial' })
    insert('revenue_subject', { subject_id: `${sid}-1`, node_key: `${sid}-1`, parent_subject_id: sid, revenue_id: id, level: '項', code: '1', name: `${name}の項`, amount_yen: yen, origin_id: 'o-initial' })
    insert('revenue_location', { line_id: sid, origin_id: 'o-initial', source_page: Number(code) + 10 })
  }
}

beforeEach(() => {
  ;({ db, sqlite } = testDb())
  insertOrigin(sqlite, { origin_id: 'o-initial', title: '予算書', url: 'https://example.test/initial.pdf', document_kind: 'initial', sha256: 'a'.repeat(64) })
  insertOrigin(sqlite, { origin_id: 'o-settlement', title: '決算書', url: 'https://example.test/settlement.pdf', sha256: 'b'.repeat(64) })
  for (const [kan_name, category] of [['特別区税', 'まちの税'], ['特別区交付金', '国・都道府県から配られるお金'], ['国庫支出金', '国・都道府県の支出金']]) insert('fiscal_revenue_category', { kan_name, category })
  root('r-2026-initial', 2026, 'initial', '一般会計', 600, [['10', '国庫支出金', 300], ['1', '特別区税', 200], ['2', '特別区交付金', 100]])
  root('r-2026-nh', 2026, 'initial', '国民健康保険事業会計', 50, [['1', '国民健康保険料', 50]])
  root('r-2025-settlement', 2025, 'settlement', '一般会計', 70, [['1', '特別区税', 70]])
})

describe('歳入（get_revenue）', () => {
  test('新しい年度から、一般会計を先に、款を印字の番号の順に返す。款の和が総額', async () => {
    const { revenues } = await call({ jurisdiction_code: '131091' })
    expect(revenues.map((r) => [r.fiscal_year, r.document_kind, r.account_name])).toEqual([
      [2026, 'initial', '一般会計'],
      [2026, 'initial', '国民健康保険事業会計'],
      [2025, 'settlement', '一般会計'],
    ])
    const general = revenues[0]!
    expect(general.kan.map((k) => k.code)).toEqual(['1', '2', '10'])
    expect(general.kan.reduce((s, k) => s + (k.amount_yen ?? 0), 0)).toBe(general.total_yen)
    expect(general.origins.map((o) => o.title)).toEqual(['予算書'])
  })

  test('区分は款の名前で辞書を引き、辞書に無い款は null。印字の頁を返す', async () => {
    const { revenues } = await call({ jurisdiction_code: '131091', fiscal_year: 2026 })
    expect(revenues[0]!.kan.map((k) => [k.name, k.category, k.page])).toEqual([
      ['特別区税', 'まちの税', 11],
      ['特別区交付金', '国・都道府県から配られるお金', 12],
      ['国庫支出金', '国・都道府県の支出金', 20],
    ])
    expect(revenues[1]!.kan[0]!.category).toBeNull()
  })

  test('年度・資料区分・会計の種類で絞る。収録の無い自治体は空', async () => {
    const { revenues } = await call({ jurisdiction_code: '131091', document_kind: 'settlement', account_kind: '一般会計' })
    expect(revenues.map((r) => r.revenue_id)).toEqual(['r-2025-settlement'])
    expect((await call({ jurisdiction_code: '132039' })).revenues).toEqual([])
  })
})
