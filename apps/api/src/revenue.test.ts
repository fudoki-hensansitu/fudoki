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

  test('区分は款の名前で辞書を引き、辞書に無い款は null。印字の頁とその冊を返す', async () => {
    const { revenues } = await call({ jurisdiction_code: '131091', fiscal_year: 2026 })
    expect(revenues[0]!.kan.map((k) => [k.name, k.category, k.page, k.origin_id])).toEqual([
      ['特別区税', 'まちの税', 11, 'o-initial'],
      ['特別区交付金', '国・都道府県から配られるお金', 12, 'o-initial'],
      ['国庫支出金', '国・都道府県の支出金', 20, 'o-initial'],
    ])
    expect(revenues[1]!.kan[0]!.category).toBeNull()
  })

  test('年度・資料区分・会計の種類で絞る。収録の無い自治体は空', async () => {
    const { revenues } = await call({ jurisdiction_code: '131091', document_kind: 'settlement', account_kind: '一般会計' })
    expect(revenues.map((r) => r.revenue_id)).toEqual(['r-2025-settlement'])
    expect((await call({ jurisdiction_code: '132039' })).revenues).toEqual([])
  })
})

// 歳入の科目・内訳の検索と行の取得（search_revenue_subjects・search_revenue_details・get_revenue_line）。歳出の科目・内訳と同じ形
describe('歳入の科目・内訳（search_revenue_subjects・search_revenue_details・get_revenue_line）', () => {
  const op = async (name: string, input: Record<string, unknown>) => (await callWebOp({ DB: db } as never, name, input)) as { ok: boolean; value?: any; status?: number }
  const KAN = 'a'.repeat(64)
  const KOU = 'b'.repeat(64)
  const MOKU = 'c'.repeat(64)
  beforeEach(() => {
    insert('revenue_subject', { subject_id: KAN, node_key: KAN, parent_subject_id: null, revenue_id: 'r-2025-settlement', level: '款', code: '2', name: '特別区交付金', amount_yen: 30, origin_id: 'o-settlement' })
    insert('revenue_subject', { subject_id: KOU, node_key: KOU, parent_subject_id: KAN, revenue_id: 'r-2025-settlement', level: '項', code: '1', name: '特別区財政調整交付金', amount_yen: 30, origin_id: 'o-settlement' })
    insert('revenue_subject', { subject_id: MOKU, node_key: MOKU, parent_subject_id: KOU, revenue_id: 'r-2025-settlement', level: '目', code: '1', name: '普通交付金', amount_yen: 30, origin_id: 'o-settlement' })
    insert('revenue_location', { line_id: MOKU, origin_id: 'o-settlement', source_page: 40 })
  })

  test('項・目を、根の値・所属する款・項・目・区分・子の有無つきで返す', async () => {
    const res = await op('search_revenue_subjects', { document_kind: 'settlement', fiscal_year: { min: 2025, max: 2025 }, where: { kan_name: { eq: ['特別区交付金'] } }, order_by: [{ column: 'code' }] })
    expect(res.ok).toBe(true)
    const rows = res.value.subjects.map((s: any) => [s.level, s.name, s.kan_name, s.kou_name, s.moku_name, s.category, s.is_leaf, s.amount_phase, s.jurisdiction_code])
    expect(rows).toEqual([
      ['項', '特別区財政調整交付金', '特別区交付金', '特別区財政調整交付金', null, '国・都道府県から配られるお金', false, 'executed', '131091'],
      ['目', '普通交付金', '特別区交付金', '特別区財政調整交付金', '普通交付金', '国・都道府県から配られるお金', true, 'executed', '131091'],
      ['款', '特別区交付金', '特別区交付金', null, null, '国・都道府県から配られるお金', false, 'executed', '131091'],
    ])
    expect(res.value.origins.map((o: any) => o.origin_id)).toEqual(['o-settlement'])
  })

  test('is_leaf の行の和が総額', async () => {
    const res = await op('search_revenue_subjects', { document_kind: 'settlement', fiscal_year: { min: 2025, max: 2025 }, where: { is_leaf: { eq: true } }, page_size: 100 })
    expect(res.value.subjects.reduce((s: number, r: any) => s + r.amount_yen, 0)).toBe(70 + 30)
  })

  test('収録の無い自治体・年度は空', async () => {
    const res = await op('search_revenue_subjects', { document_kind: 'initial', fiscal_year: { min: 2020, max: 2020 } })
    expect(res.ok).toBe(true)
    expect(res.value.subjects).toEqual([])
  })

  test('目の下の節を、根の値・所属する款・項・目つきで返す。depth = 1 の和が目の額', async () => {
    insert('revenue_detail', { detail_id: 'd1', node_key: 'd1', parent_detail_id: null, subject_id: MOKU, revenue_id: 'r-2025-settlement', source_heading: '節', node_kind: '節', depth: 1, code: '1', name: '普通交付金', amount_yen: 20, origin_id: 'o-settlement' })
    insert('revenue_detail', { detail_id: 'd2', node_key: 'd2', parent_detail_id: null, subject_id: MOKU, revenue_id: 'r-2025-settlement', source_heading: '節', node_kind: '節', depth: 1, code: '2', name: '特別交付金', amount_yen: 10, origin_id: 'o-settlement' })
    insert('revenue_detail', { detail_id: 'd3', node_key: 'd3', parent_detail_id: 'd1', subject_id: MOKU, revenue_id: 'r-2025-settlement', source_heading: '節', node_kind: '内訳2', depth: 2, code: null, name: '現年度分', amount_yen: 20, origin_id: 'o-settlement' })
    const res = await op('search_revenue_details', { document_kind: 'settlement', fiscal_year: { min: 2025, max: 2025 }, where: { subject_id: { eq: [MOKU] }, depth: { eq: [1] } }, order_by: [{ column: 'amount_yen', desc: true }] })
    expect(res.ok).toBe(true)
    expect(res.value.details.map((d: any) => [d.name, d.amount_yen, d.kan_name, d.kou_name, d.moku_name, d.is_leaf, d.amount_phase, d.jurisdiction_code])).toEqual([
      ['普通交付金', 20, '特別区交付金', '特別区財政調整交付金', '普通交付金', false, 'executed', '131091'],
      ['特別交付金', 10, '特別区交付金', '特別区財政調整交付金', '普通交付金', true, 'executed', '131091'],
    ])
    expect(res.value.details.reduce((s: number, d: any) => s + d.amount_yen, 0)).toBe(30)
    expect(res.value.origins.map((o: any) => o.origin_id)).toEqual(['o-settlement'])
  })

  test('行と子の科目・印字の位置・出典を返し、無い行は 404', async () => {
    const res = await op('get_revenue_line', { line_id: KOU })
    expect(res.ok).toBe(true)
    expect([res.value.line.name, res.value.line.level]).toEqual(['特別区財政調整交付金', '項'])
    expect(res.value.child_subjects.map((s: any) => s.name)).toEqual(['普通交付金'])
    expect(res.value.locations.map((l: any) => [l.line_id, l.source_page])).toEqual([[MOKU, 40]])
    expect(res.value.origins.map((o: any) => o.origin_id)).toEqual(['o-settlement'])
    const missing = await op('get_revenue_line', { line_id: 'd'.repeat(64) })
    expect(missing.ok).toBe(false)
  })
})
