import { beforeEach, describe, expect, test } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/server/validators/cf-worker'
import { createApp } from './app'
import type { Db } from './db'
import { insertCoverage, insertJurisdiction, insertNode, insertOrigin, testDb } from './testing'

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
  insertJurisdiction(sqlite, { jurisdiction_code: '132039', name: '武蔵野市' })
  insertJurisdiction(sqlite, { jurisdiction_code: '132063', name: '府中市' })
  insertJurisdiction(sqlite, { jurisdiction_code: '342076', name: '府中市', prefecture_name: '広島県' })
  insertOrigin(sqlite, { origin_id: 'o1', title: '令和6年度決算書', url: 'https://example.test/o1.pdf', sha256: 'a' })
  insertOrigin(sqlite, { origin_id: 'o2', title: '令和6年度決算書（特別会計）', url: 'https://example.test/o2.pdf', sha256: 'b' })
  insertOrigin(sqlite, { origin_id: 'o3', title: '令和6年度予算', url: 'https://example.test/o3.csv', document_kind: 'initial', format: 'csv', sha256: 'c' })
  insertCoverage(sqlite, { jurisdiction_code: '132039', fiscal_year: 2024, document_kind: 'settlement', account_name: '国民健康保険事業会計', account_kind: '国民健康保険', origin_id: 'o2' })
  insertCoverage(sqlite, { jurisdiction_code: '132039', fiscal_year: 2024, document_kind: 'settlement', account_name: '一般会計', origin_id: 'o1' })
  insertCoverage(sqlite, { jurisdiction_code: '132039', fiscal_year: 2024, document_kind: 'initial', account_name: '一般会計', origin_id: 'o3' })
  insertCoverage(sqlite, { jurisdiction_code: '132063', fiscal_year: 2024, document_kind: 'settlement', account_name: '一般会計', origin_id: 'o2' })
  insertCoverage(sqlite, { jurisdiction_code: '132063', fiscal_year: 2024, document_kind: 'settlement', account_name: '一般会計', origin_id: 'o1' })
})

describe('団体と収録範囲（GET /v1/jurisdictions・list_jurisdictions）', () => {
  test('既定（BASIC）は原典を含めず、年度・資料区分・会計だけを返す', async () => {
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
    // 原典が複数あっても、会計は1つにまとまる
    const fuchu = await list(`?code=132063`)
    expect(fuchu.jurisdictions[0].coverage[0].accounts).toEqual([{ account_name: '一般会計', account_kind: '一般会計' }])
  })

  test('view=FULL は、6桁のコードと収録している年度・資料区分・会計・原典を1回で得る', async () => {
    const body = await list(`?name=${encodeURIComponent('武蔵野市')}&view=FULL`)
    expect(body).toEqual({
      jurisdictions: [
        {
          jurisdiction_code: '132039',
          name: '武蔵野市',
          prefecture_code: '13',
          prefecture_name: '東京都',
          ocd_id: 'ocd-division/country:jp/prefecture:13/city:132039',
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
        },
      ],
      next_page_token: null,
    })
  })

  test('5桁と6桁のコードで同じ結果になる', async () => {
    const six = await list('?code=132039')
    expect(six.jurisdictions).toHaveLength(1)
    expect(await list('?code=13203')).toEqual(six)
  })

  test('絞らなければ全団体をコード順に、ページをまたいで欠落・重複なく返す', async () => {
    const all = await list()
    expect(all.jurisdictions.map((j: { jurisdiction_code: string }) => j.jurisdiction_code)).toEqual(['131016', '132039', '132063', '342076'])
    const seen: string[] = []
    let token: string | null = null
    for (let i = 0; i < 10; i++) {
      const page: { jurisdictions: { jurisdiction_code: string }[]; next_page_token: string | null } = await list(`?page_size=1${token ? `&page_token=${token}` : ''}`)
      seen.push(...page.jurisdictions.map((j) => j.jurisdiction_code))
      // 団体の収録範囲はページで切らない
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
    expect(tool.description).toContain('search_expenditure_nodes')
    const validate = new CfWorkerJsonSchemaValidator().getValidator(tool.outputSchema as never)
    for (const args of [{ name: '武蔵野市' }, { code: '13203' }, {}, { page_size: 1 }]) {
      const body = await rpc('tools/call', { name: 'list_jurisdictions', arguments: args })
      expect(body.result.isError, JSON.stringify(args)).toBeUndefined()
      const result = validate(body.result.structuredContent)
      expect(result.valid, result.valid ? '' : result.errorMessage).toBe(true)
      expect(body.result.structuredContent).toEqual(JSON.parse(body.result.content[0].text))
    }
    const rest = await list(`?name=${encodeURIComponent('武蔵野市')}&view=FULL`)
    expect((await rpc('tools/call', { name: 'list_jurisdictions', arguments: { name: '武蔵野市', view: 'FULL' } })).result.structuredContent).toEqual(rest)
    const err = await rpc('tools/call', { name: 'list_jurisdictions', arguments: { code: '1' } })
    expect(err.error !== undefined || err.result.isError === true).toBe(true)
  })

  test('返った条件でそのまま明細を検索できる', async () => {
    insertNode(sqlite, { document_kind: 'settlement', node_id: 'a'.repeat(64), jurisdiction_code: '132039', fiscal_year: 2024, account_name: '国民健康保険事業会計', node_kind: '款', origin_id: 'o2' })
    const j = (await list('?code=132039&view=FULL')).jurisdictions[0]
    const c = j.coverage.find((x: { document_kind: string }) => x.document_kind === 'settlement')
    const a = c.accounts.find((x: { account_name: string }) => x.account_name === '国民健康保険事業会計')
    const res = await app.request(
      '/v1/expenditure/nodes:search',
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
    expect(found.nodes).toHaveLength(1)
    expect(found.origins.map((o: { origin_id: string }) => o.origin_id)).toEqual(a.origins.map((o: { origin_id: string }) => o.origin_id))
  })
})
