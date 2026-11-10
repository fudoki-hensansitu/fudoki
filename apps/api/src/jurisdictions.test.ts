import { beforeEach, describe, expect, test } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/server/validators/cf-worker'
import { createApp } from './app'
import { UNCOVERED_SOURCES } from './jurisdiction/queries'
import type { Db } from './db'
import { insertCoverage, insertJurisdiction, insertOrigin, insertPopulation, insertSubject, testDb } from './testing'

let db: Db
let sqlite: Database
const app = createApp()

const get = (path: string) => app.request(path, {}, { DB: db })
const list = async (query = '') => {
  const res = await get(`/v1/jurisdictions${query}`)
  expect(res.status, query).toBe(200)
  return res.json()
}
const MCP_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }
const rpcBody = async (res: Response) => {
  const text = await res.text()
  const data = /^data: (.*)$/m.exec(text)
  return JSON.parse(data ? data[1]! : text)
}
const rpc = async (method: string, params: unknown = {}) =>
  rpcBody(await app.request('/mcp', { method: 'POST', headers: MCP_HEADERS, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }, { DB: db }))

beforeEach(() => {
  ;({ db, sqlite } = testDb())
  insertJurisdiction(sqlite, { jurisdiction_code: '131016', name: '千代田区' })
  insertJurisdiction(sqlite, { jurisdiction_code: '132039', name: '武蔵野市', official_url: 'https://www.city.musashino.lg.jp/' })
  insertJurisdiction(sqlite, { jurisdiction_code: '132063', name: '府中市' })
  insertJurisdiction(sqlite, { jurisdiction_code: '342076', name: '府中市', prefecture_name: '広島県' })
  // 新しい基準日を先に入れても、基準日の昇順で返る
  insertPopulation(sqlite, { origin_id: 'p2026', reference_date: '2026-01-01', url: 'https://example.test/2026.xlsx' }, [
    { jurisdiction_code: '132039', male: 72000, female: 76000, population: 148001, households: 76000 },
  ])
  insertPopulation(sqlite, { origin_id: 'p2025', reference_date: '2025-01-01', url: 'https://example.test/2025.xlsx' }, [
    { jurisdiction_code: '132039', male: 71000, female: 75000, population: 146000, households: 75000 },
    { jurisdiction_code: '132063', male: 130000, female: 130000, population: 260000, households: 130000 },
  ])
  insertOrigin(sqlite, { origin_id: 'o1', title: '令和6年度決算書', url: 'https://example.test/o1.pdf', sha256: 'a' })
  insertOrigin(sqlite, { origin_id: 'o2', title: '令和6年度決算書（特別会計）', url: 'https://example.test/o2.pdf', sha256: 'b' })
  insertOrigin(sqlite, { origin_id: 'o3', title: '令和6年度予算', url: 'https://example.test/o3.csv', document_kind: 'initial', format: 'csv', sha256: 'c' })
  insertCoverage(sqlite, { jurisdiction_code: '132039', fiscal_year: 2024, document_kind: 'settlement', account_name: '国民健康保険事業会計', account_kind: '国民健康保険', origin_id: 'o2' })
  insertCoverage(sqlite, { jurisdiction_code: '132039', fiscal_year: 2024, document_kind: 'settlement', account_name: '一般会計', origin_id: 'o1' })
  insertCoverage(sqlite, { jurisdiction_code: '132039', fiscal_year: 2024, document_kind: 'initial', account_name: '一般会計', origin_id: 'o3' })
  insertCoverage(sqlite, { jurisdiction_code: '132063', fiscal_year: 2024, document_kind: 'settlement', account_name: '一般会計', origin_id: 'o2' })
  insertCoverage(sqlite, { jurisdiction_code: '132063', fiscal_year: 2024, document_kind: 'settlement', account_name: '一般会計', origin_id: 'o1' })
})

describe('自治体と収録範囲（GET /v1/jurisdictions・list_jurisdictions）', () => {
  test('一覧は出典を含めず、年度・資料区分・会計だけを返す', async () => {
    const body = await list(`?name=${encodeURIComponent('武蔵野市')}`)
    expect(body.jurisdictions[0].coverage.map((c: { document_kind: string; accounts: unknown[] }) => [c.document_kind, c.accounts])).toEqual([
      ['initial', [{ account_name: '一般会計', account_kind: '一般会計' }]],
      [
        'settlement',
        [
          { account_name: '一般会計', account_kind: '一般会計' },
          { account_name: '国民健康保険事業会計', account_kind: '国民健康保険' },
        ],
      ],
    ])
    // 出典が複数あっても、会計は1つにまとまる
    const fuchu = await list(`?code=132063`)
    expect(fuchu.jurisdictions[0].coverage[0].accounts).toEqual([{ account_name: '一般会計', account_kind: '一般会計' }])
  })

  test('一覧は人口の推移と、事業評価・予算案を収録した年度を返す', async () => {
    sqlite.exec(`INSERT INTO evaluation (evaluation_id, jurisdiction_code, fiscal_year, kind) VALUES ('e2', '132039', 2025, 'sheets_only'), ('e1', '132039', 2024, 'with_result')`)
    sqlite.exec(`INSERT INTO budget_proposal (budget_proposal_id, jurisdiction_code, fiscal_year) VALUES ('b1', '132039', 2026)`)
    const [j] = (await list('?code=132039')).jurisdictions
    expect(j.population.map((p: { reference_date: string }) => p.reference_date)).toEqual(['2025-01-01', '2026-01-01'])
    expect(j.evaluations).toEqual([{ evaluation_id: 'e1', fiscal_year: 2024 }, { evaluation_id: 'e2', fiscal_year: 2025 }])
    expect(j.budget_proposals).toEqual([{ budget_proposal_id: 'b1', fiscal_year: 2026 }])
    const detail = await (await get('/v1/jurisdictions/132039')).json()
    expect([detail.evaluations.map((e: { fiscal_year: number }) => e.fiscal_year), detail.budget_proposals.length]).toEqual([[2024, 2025], 1])
  })

  test('1つの自治体は、人口の推移と収録している年度・資料区分・会計・出典を1回で得る', async () => {
    const res = await get('/v1/jurisdictions/132039')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
          jurisdiction_code: '132039',
          name: '武蔵野市',
          prefecture_code: '13',
          prefecture_name: '東京都',
          ocd_id: 'ocd-division/country:jp/prefecture:13/city:132039',
          official_url: 'https://www.city.musashino.lg.jp/',
          population: [
            { reference_date: '2025-01-01', male: 71000, female: 75000, population: 146000, households: 75000, url: 'https://example.test/2025.xlsx' },
            { reference_date: '2026-01-01', male: 72000, female: 76000, population: 148001, households: 76000, url: 'https://example.test/2026.xlsx' },
          ],
          coverage: [
            {
              fiscal_year: 2024,
              document_kind: 'initial',
              accounts: [{ account_name: '一般会計', account_kind: '一般会計', origins: [{ origin_id: 'o3', title: '令和6年度予算', url: 'https://example.test/o3.csv', format: 'csv' }] }],
            },
            {
              fiscal_year: 2024,
              document_kind: 'settlement',
              accounts: [
                { account_name: '一般会計', account_kind: '一般会計', origins: [{ origin_id: 'o1', title: '令和6年度決算書', url: 'https://example.test/o1.pdf', format: 'pdf' }] },
                {
                  account_name: '国民健康保険事業会計',
                  account_kind: '国民健康保険',
                  origins: [{ origin_id: 'o2', title: '令和6年度決算書（特別会計）', url: 'https://example.test/o2.pdf', format: 'pdf' }],
                },
              ],
            },
          ],
          evaluations: [],
          budget_proposals: [],
          uncovered_sources: UNCOVERED_SOURCES,
    })
    expect((await get('/v1/jurisdictions/999999')).status).toBe(404)
    expect((await get('/v1/jurisdictions/13203')).status).toBe(400)
  })

  test('収録の無い自治体でも、空の収録範囲と一緒に統計の出典の案内を返す', async () => {
    const body = await list('?code=131016')
    expect(body.jurisdictions[0].coverage).toEqual([])
    expect(body.jurisdictions[0].population).toEqual([])
    expect(body.uncovered_sources.map((s: { url: string }) => s.url)).toEqual([
      'https://www.soumu.go.jp/iken/zaisei/card.html',
      'https://www.e-stat.go.jp/stat-search/files?toukei=00200251&tstat=000001077755',
    ])
  })

  test('5桁と6桁のコードで同じ結果になる', async () => {
    const six = await list('?code=132039')
    expect(six.jurisdictions).toHaveLength(1)
    expect(await list('?code=13203')).toEqual(six)
  })

  test('絞らなければ全自治体をコード順に、ページをまたいで欠落・重複なく返す', async () => {
    const all = await list()
    expect(all.jurisdictions.map((j: { jurisdiction_code: string }) => j.jurisdiction_code)).toEqual(['131016', '132039', '132063', '342076'])
    const seen: string[] = []
    let token: string | null = null
    for (let i = 0; i < 10; i++) {
      const page: { jurisdictions: { jurisdiction_code: string }[]; next_page_token: string | null } = await list(`?page_size=1${token ? `&page_token=${token}` : ''}`)
      seen.push(...page.jurisdictions.map((j) => j.jurisdiction_code))
      // 自治体の収録範囲はページで切らない
      expect(page.jurisdictions).toEqual(all.jurisdictions.filter((j: { jurisdiction_code: string }) => page.jurisdictions.some((p) => p.jurisdiction_code === j.jurisdiction_code)))
      token = page.next_page_token
      if (token === null) break
    }
    expect(seen).toEqual(['131016', '132039', '132063', '342076'])
  })

  test('page_token は同じ条件の問い合わせにだけ使える', async () => {
    const first = await list('?page_size=1')
    const res = await get(`/v1/jurisdictions?page_size=1&name=${encodeURIComponent('府中')}&page_token=${first.next_page_token}`)
    expect(res.status).toBe(400)
  })

  test('入力の誤りは 400', async () => {
    for (const q of ['?code=1320', '?code=1320391', '?code=13203a', '?page_size=0', '?page_size=101', `?name=${'a'.repeat(51)}`, '?extra=1'])
      expect((await get(`/v1/jurisdictions${q}`)).status, q).toBe(400)
  })

  test('MCP の tool でも同じ結果を返し、structuredContent が outputSchema に通る', async () => {
    const tools = (await rpc('tools/list')).result.tools as { name: string; outputSchema: unknown; description: string }[]
    const tool = tools.find((t) => t.name === 'list_jurisdictions')!
    expect(tool.description).toContain('search_expenditure_subjects')
    const validate = new CfWorkerJsonSchemaValidator().getValidator(tool.outputSchema as never)
    for (const args of [{ name: '武蔵野市' }, { code: '13203' }, {}, { page_size: 1 }]) {
      const body = await rpc('tools/call', { name: 'list_jurisdictions', arguments: args })
      expect(body.result.isError, JSON.stringify(args)).toBeUndefined()
      const result = validate(body.result.structuredContent)
      expect(result.valid, result.valid ? '' : result.errorMessage).toBe(true)
      expect(body.result.structuredContent).toEqual(JSON.parse(body.result.content[0].text))
    }
    const rest = await list(`?name=${encodeURIComponent('武蔵野市')}`)
    expect((await rpc('tools/call', { name: 'list_jurisdictions', arguments: { name: '武蔵野市' } })).result.structuredContent).toEqual(rest)
    const err = await rpc('tools/call', { name: 'list_jurisdictions', arguments: { code: '1' } })
    expect(err.error !== undefined || err.result.isError === true).toBe(true)
  })

  test('返った条件でそのまま明細を検索できる', async () => {
    insertSubject(sqlite, { document_kind: 'settlement', subject_id: 'a'.repeat(64), jurisdiction_code: '132039', fiscal_year: 2024, account_name: '国民健康保険事業会計', level: '款', origin_id: 'o2' })
    const j = await (await get('/v1/jurisdictions/132039')).json()
    const c = j.coverage.find((x: { document_kind: string }) => x.document_kind === 'settlement')
    const a = c.accounts.find((x: { account_name: string }) => x.account_name === '国民健康保険事業会計')
    const res = await app.request(
      '/v1/expenditures/subjects:search',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_kind: c.document_kind,
          fiscal_year: { min: c.fiscal_year, max: c.fiscal_year },
          where: { jurisdiction_code: { eq: [j.jurisdiction_code] }, account_name: { eq: [a.account_name] } },
        }),
      },
      { DB: db }
    )
    const found = await res.json()
    expect(found.subjects).toHaveLength(1)
    expect(found.origins.map((o: { origin_id: string }) => o.origin_id)).toEqual(a.origins.map((o: { origin_id: string }) => o.origin_id))
  })
})
