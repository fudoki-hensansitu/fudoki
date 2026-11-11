import { beforeEach, describe, expect, test } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { createApp } from './app'
import columnsJson from './columns.json'
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/server/validators/cf-worker'
import { tools as operations } from './app'
import type { Db } from './db'
import { insertDetail, insertOrigin, insertSubject, testDb } from './testing'

let db: Db
let sqlite: Database
const app = createApp()

// subject_id・detail_id は小文字 16 進 64 文字。当初予算の款（K1I）は決算の款と node_key が同じで ID が違う
const id = (prefix: string) => prefix.padEnd(64, '0')
const [K1, M1, M2, S1, OLD, K1I] = [id('a1'), id('b1'), id('b2'), id('c1'), id('d1'), id('a2')]

/** MCP の応答の body。2025 年代の client には SDK が SSE（`data: {...}`）で返し、2026-07-28 の要求には JSON で返す。 */
const rpcBody = async (res: Response) => {
  const text = await res.text()
  const data = /^data: (.*)$/m.exec(text)
  return JSON.parse(data ? data[1]! : text)
}

const get = (path: string) => app.request(path, {}, { DB: db })
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(
    path,
    { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) },
    { DB: db }
  )
const SEARCH = '/v1/expenditures/subjects:search'
const SUBJECT = (subjectId: string) => `/v1/expenditures/lines/${subjectId}`
const search = (body: Record<string, unknown>) => post(SEARCH, { document_kind: 'settlement', fiscal_year: { min: 2024, max: 2024 }, ...body })
const ids = (body: { subjects: { subject_id: string }[] }) => body.subjects.map((n) => n.subject_id)

beforeEach(() => {
  ;({ db, sqlite } = testDb())
  insertOrigin(sqlite, { origin_id: 'o1', title: '決算書', url: 'https://example.test/o1', sha256: 'aaa' })
  insertOrigin(sqlite, { origin_id: 'o2', title: '決算書2', url: 'https://example.test/o2', sha256: 'bbb' })
  insertSubject(sqlite, { subject_id: K1, level: '款', name: '総務費', amount_yen: 900, origin_id: 'o1' })
  insertSubject(sqlite, { subject_id: M1, parent_subject_id: K1, level: '目', name: '庁舎管理費', amount_yen: 500, cofog_code: '01.3', origin_id: 'o1' })
  insertSubject(sqlite, { subject_id: M2, parent_subject_id: K1, level: '目', name: '広報費', amount_yen: 400, cofog_code: '01.3', origin_id: 'o1' })
  insertDetail(sqlite, { detail_id: S1, subject_id: M1, breakdown: '節', source_heading: '節', node_kind: '節', name: '委託料', amount_yen: 500, origin_id: 'o2' })
  insertSubject(sqlite, { document_kind: 'initial', subject_id: K1I, node_key: K1, level: '款', name: '総務費', amount_yen: 950, origin_id: 'o1' })
  insertSubject(sqlite, { subject_id: OLD, fiscal_year: 2019, level: '目', name: '古い', amount_yen: 1 })
})

describe('kill switch', () => {
  test('serving が on 以外なら全パスで 503 と no-store', async () => {
    sqlite.query(`UPDATE control SET value = 'off' WHERE key = 'serving'`).run()
    for (const path of ['/', '/openapi.json', '/v1/jurisdictions']) {
      const res = await get(path)
      expect(res.status).toBe(503)
      expect(res.headers.get('Cache-Control')).toBe('no-store')
      expect((await res.json()).error.code).toBe('UNAVAILABLE')
    }
    expect((await search({})).status).toBe(503)
  })

  test('control が読めないときも止める', async () => {
    sqlite.query('DROP TABLE control').run()
    expect((await get('/')).status).toBe(503)
  })
})

describe('crawler の除外', () => {
  test('robots.txt は全拒否で、すべての応答に noindex, nofollow', async () => {
    const robots = await get('/robots.txt')
    expect(robots.status).toBe(200)
    expect(await robots.text()).toBe('User-agent: *\nDisallow: /\n')
    for (const path of ['/robots.txt', '/health', '/openapi.json', '/no-such-path']) {
      expect((await get(path)).headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
    }
  })
})

describe('GET /health', () => {
  test('200 と {status: ok}、no-store', async () => {
    const res = await get('/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  test('D1 を一切読まない（binding が壊れていても 200）', async () => {
    const touched: string[] = []
    const broken = { prepare: (sql: string) => (touched.push(sql), Promise.reject(new Error('boom'))), batch: () => Promise.reject(new Error('boom')) }
    const res = await app.request('/health', {}, { DB: broken })
    expect(res.status).toBe(200)
    expect(touched).toEqual([])
    expect((await app.request('/health', {}, {})).status).toBe(200) // DB が無い
  })

  test('kill switch が off でも 200', async () => {
    sqlite.query(`UPDATE control SET value = 'off' WHERE key = 'serving'`).run()
    expect((await get('/health')).status).toBe(200)
    expect((await get('/')).status).toBe(503)
  })

})

describe('search', () => {
  test('絞り込み・boolean の復元・origins は一度ずつ', async () => {
    const res = await search({ where: { level: { eq: ['目'] } }, order_by: [{ column: 'amount_yen', desc: true }] })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(ids(body)).toEqual([M1, M2])
    expect(body.subjects[0].is_leaf).toBe(true)
    expect(body.subjects[0].parent_subject_id).toBe(K1)
    expect(body.subjects[0].cofog_status).toBeNull()
    expect(body.next_page_token).toBeNull()
    expect(body.origins).toHaveLength(1)
    expect(body.origins[0].origin_id).toBe('o1')
  })

  test('document_kind で行を絞り、決算と当初予算は node_key で対応する', async () => {
    const body = await (await post(SEARCH, { document_kind: 'initial', fiscal_year: { min: 2024, max: 2024 } })).json()
    expect(ids(body)).toEqual([K1I])
    expect(body.subjects[0].document_kind).toBe('initial')
    expect(body.subjects[0].amount_phase).toBe('approved')
    expect(body.subjects[0].node_key).toBe(K1)
    expect(body.subjects[0].amount_yen).toBe(950)
  })

  test('内訳の検索は breakdown で絞れる', async () => {
    const res = await post('/v1/expenditures/details:search', { document_kind: 'settlement', fiscal_year: { min: 2024, max: 2024 }, where: { breakdown: { eq: ['節'] } } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.details.map((d: { detail_id: string }) => d.detail_id)).toEqual([S1])
    expect(body.details[0].subject_id).toBe(M1)
    expect(body.origins.map((o: { origin_id: string }) => o.origin_id)).toEqual(['o2'])
  })

  test('GLOB の特殊文字は escape される', async () => {
    insertSubject(sqlite, { subject_id: id('e1'), name: 'a*b[c]?' })
    insertSubject(sqlite, { subject_id: id('e2'), name: 'axb' })
    const body = await (await search({ where: { name: { prefix: 'a*b' } } })).json()
    expect(ids(body)).toEqual([id('e1')])
    expect(ids(await (await search({ where: { name: { contains: '[c]?' } } })).json())).toEqual([id('e1')])
  })

  test('ページングは order_by の末尾に subject_id を足して順序を決める', async () => {
    const base = { order_by: [{ column: 'level' }], page_size: 2 }
    const page1 = await (await search(base)).json()
    expect(page1.subjects).toHaveLength(2)
    expect(page1.next_page_token).toBeString()
    const page2 = await (await search({ ...base, page_token: page1.next_page_token })).json()
    expect(page2.next_page_token).toBeNull()
    expect([...ids(page1), ...ids(page2)]).toEqual([K1, M1, M2]) // 款 → 目、同じ level は subject_id 順
  })

  test('page_token は page_size を変えても使え、別の問い合わせでは 400', async () => {
    const page1 = await (await search({ page_size: 1 })).json()
    expect((await search({ page_size: 3, page_token: page1.next_page_token })).status).toBe(200)
    const other = await search({ page_size: 1, where: { amount_yen: { min: 1 } }, page_token: page1.next_page_token })
    expect(other.status).toBe(400)
    expect((await other.json()).error.message).toContain('別の問い合わせ')
    expect((await search({ page_token: '!!' })).status).toBe(400)
    expect((await search({ page_token: 'a'.repeat(513) })).status).toBe(400)
  })

  test.each([
    ['body が空のオブジェクト', {}],
    ['document_kind なし', { fiscal_year: { min: 2024, max: 2024 } }],
    ['fiscal_year なし', { document_kind: 'settlement' }],
    ['補正予算', { document_kind: 'supplementary', fiscal_year: { min: 2024, max: 2024 } }],
    ['6年', { fiscal_year: { min: 2019, max: 2024 } }],
    ['max < min', { fiscal_year: { min: 2024, max: 2023 } }],
    ['年が範囲外', { fiscal_year: { min: 0, max: 1 } }],
    ['巨大な年', { fiscal_year: { min: 1e20, max: 1e20 } }],
    ['小数の年', { fiscal_year: { min: 2024.5, max: 2025 } }],
    ['未知のキー', { foo: 1 }],
    ['where の未知の列', { where: { row_hash: { eq: ['x'] } } }],
    ['where の fiscal_year', { where: { fiscal_year: { min: 1 } } }],
    ['where の document_kind', { where: { document_kind: { eq: ['initial'] } } }],
    ['条件のキーが空', { where: { name: {} } }],
    ['条件の未知のキー', { where: { name: { like: 'x' } } }],
    ['型違いの条件', { where: { amount_yen: { prefix: 'x' } } }],
    ['eq が空', { where: { name: { eq: [] } } }],
    ['eq が 101 個', { where: { name: { eq: Array.from({ length: 101 }, (_, i) => String(i)) } } }],
    ['文字列が 201 文字', { where: { name: { prefix: 'a'.repeat(201) } } }],
    ['bind が多すぎる', { where: { name: { eq: Array.from({ length: 50 }, (_, i) => `a${i}`) }, code: { eq: Array.from({ length: 41 }, (_, i) => `b${i}`) } } }],
    ['order_by が許可列でない', { order_by: [{ column: 'row_hash' }] }],
    ['order_by が 6 個', { order_by: Array.from({ length: 6 }, () => ({ column: 'name' })) }],
    ['order_by が同じ列', { order_by: [{ column: 'name' }, { column: 'name', desc: true }] }],
    ['page_size が 0', { page_size: 0 }],
    ['page_size が 1001', { page_size: 1001 }],
    ['page_size が小数', { page_size: 1.5 }],
    ['filter 文字列は受けない', { filter: 'document_kind = "settlement"' }],
  ])('%s は 400 と {error: {code, message}}', async (_, body) => {
    const exact = ['body が空のオブジェクト', 'document_kind なし', 'fiscal_year なし', '補正予算', '6年', 'max < min', '年が範囲外', '巨大な年', '小数の年'].includes(_)
    const r = await post(SEARCH, exact ? body : { document_kind: 'settlement', fiscal_year: { min: 2024, max: 2024 }, ...body })
    expect(r.status).toBe(400)
    const json = await r.json()
    expect(json.error.code).toBe('INVALID_ARGUMENT')
    expect(json.error.message).toBeString()
  })

  test('bind がちょうど上限なら通る', async () => {
    const eq = Array.from({ length: 88 }, (_, i) => `n${i}`) // 資料区分・年 1 つと合わせて 90
    expect((await search({ where: { name: { eq } } })).status).toBe(200)
    expect((await search({ where: { name: { eq: [...eq, 'x'] } } })).status).toBe(400)
  })

  test('JSON でない body・大きすぎる body', async () => {
    const bad = await post(SEARCH, '{not json')
    expect(bad.status).toBe(400)
    expect((await bad.json()).error.code).toBe('INVALID_ARGUMENT')
    const big = await post(SEARCH, JSON.stringify({ x: 'a'.repeat(20000) }))
    expect(big.status).toBe(413)
  })

  test('SQL インジェクションの値は bind される', async () => {
    const body = await (await search({ where: { name: { eq: [`x' OR 1=1 --`], prefix: `"; DROP TABLE control; --` } } })).json()
    expect(body.subjects).toEqual([])
    expect(sqlite.query('SELECT count(*) AS n FROM control').get()).toEqual({ n: 1 })
  })

})

describe('get', () => {
  test('款は子の科目を返し、直下の内訳は無い', async () => {
    const res = await get(SUBJECT(K1))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.line.kind).toBe('subject')
    expect(body.line.subject_id).toBe(K1)
    expect(body.child_subjects.map((n: { subject_id: string }) => n.subject_id)).toEqual([M1, M2])
    expect(body.details).toEqual({})
    expect(body.next_page_token).toBeNull()
    expect(body.origins.map((o: { origin_id: string }) => o.origin_id)).toEqual(['o1'])
    expect(body.locations.map((l: { line_id: string }) => l.line_id).sort()).toEqual([K1, M1, M2])
  })

  test('目は直下の内訳を breakdown ごとに返し、内訳の出典も含む', async () => {
    const body = await (await get(SUBJECT(M1))).json()
    expect(body.child_subjects).toEqual([])
    expect(Object.keys(body.details)).toEqual(['節'])
    expect(body.details['節'].map((d: { detail_id: string }) => d.detail_id)).toEqual([S1])
    expect(body.origins.map((o: { origin_id: string }) => o.origin_id)).toEqual(['o1', 'o2'])
  })

  test('内訳を取得する', async () => {
    const res = await get(`/v1/expenditures/lines/${S1}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.line.kind).toBe('detail')
    expect(body.line.detail_id).toBe(S1)
    expect(body.child_subjects).toEqual([])
    expect(body.details).toEqual({})
    expect(body.origins.map((o: { origin_id: string }) => o.origin_id)).toEqual(['o2'])
  })

  test('資料区分ごとに別の ID、無ければ 404、不正な ID は 400', async () => {
    expect((await (await get(SUBJECT(K1I))).json()).line.amount_yen).toBe(950)
    const missing = await get(SUBJECT(id('ff')))
    expect(missing.status).toBe(404)
    expect((await missing.json()).error.code).toBe('NOT_FOUND')
    expect((await get(`/v1/expenditures/lines/${id('ff')}`)).status).toBe(404)
    expect((await get(SUBJECT('k1'))).status).toBe(400)
    expect((await get(SUBJECT(K1.toUpperCase()))).status).toBe(400)
  })
})

describe('MCP', () => {
  const rpc = async (method: string, params: unknown = {}, id = 1) => {
    const res = await app.request(
      '/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      },
      { DB: db }
    )
    return { res, body: res.status === 200 ? await rpcBody(res) : null }
  }
  const call = (name: string, args: unknown) => rpc('tools/call', { name, arguments: args })
  const base = { document_kind: 'settlement', fiscal_year: { min: 2024, max: 2024 } }

  test('initialize → tools/list → tools/call', async () => {
    const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } })
    expect(init.body.result.serverInfo.name).toBe('fudoki-api')
    expect(init.body.result.instructions).toContain('read-only search of Japanese municipal expenditure budgets and settlements, project evaluation sheets, budget proposal press releases and projects')
    const list = await rpc('tools/list')
    expect(list.body.result.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      'get_budget_proposal',
      'get_evaluation',
      'get_evaluation_sheet',
      'get_expenditure_line',
      'get_project',
      'list_jurisdictions',
      'render_expenditure_view',
      'search_budget_measures',
      'search_evaluation_sheets',
      'search_expenditure_details',
      'search_expenditure_subjects',
      'search_projects',
    ])
    const res = await call('search_expenditure_subjects', { ...base, where: { level: { eq: ['目'] } }, page_size: 1 })
    const out = JSON.parse(res.body.result.content[0].text)
    expect(out.subjects).toHaveLength(1)
    expect(out.next_page_token).toBeString()
    expect(res.body.result.isError).toBeUndefined()
  })

  test('入力の誤りは tool の結果として返る（isError か JSON-RPC の error）', async () => {
    const bad = await call('search_expenditure_subjects', { document_kind: 'settlement' })
    const failed = bad.body.error !== undefined || bad.body.result.isError === true
    expect(failed).toBe(true)
    const get404 = await call('get_expenditure_line', { line_id: id('ff') })
    expect(get404.body.result.isError).toBe(true)
    expect(JSON.parse(get404.body.result.content[0].text).error.code).toBe('NOT_FOUND')
  })

})

const MCP_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }
const mcp = (body: string | unknown, headers: Record<string, string> = MCP_HEADERS) =>
  app.request('/mcp', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }, { DB: db })
const toolCall = (args: unknown, id = 1) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'search_expenditure_subjects', arguments: args } })
const valid = { document_kind: 'settlement', fiscal_year: { min: 2024, max: 2024 } }

describe('MCP の batch', () => {
  test('最上位が配列の要求は JSON-RPC のエラーで 400（検索は実行されない）', async () => {
    const calls: string[] = []
    const spy: Db = { prepare: (sql) => (calls.push(sql), db.prepare(sql)), batch: (s) => db.batch(s) }
    const res = await app.request('/mcp', { method: 'POST', headers: MCP_HEADERS, body: JSON.stringify([toolCall(valid, 1), toolCall(valid, 2)]) }, { DB: spy })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.jsonrpc).toBe('2.0')
    expect(body.error.code).toBe(-32600)
    expect(body.id).toBeNull()
    expect(calls.filter((c) => c.includes('expenditure_subject'))).toEqual([])
    expect((await mcp([])).status).toBe(400)
  })

  test('壊れた JSON・巨大な body・JSON でない Content-Type は JSON-RPC のエラー', async () => {
    const bad = await mcp('{nope')
    expect(bad.status).toBe(400)
    expect((await bad.json()).error.code).toBe(-32700)
    expect((await mcp('x'.repeat(20000))).status).toBe(413)
    const ct = await mcp(toolCall(valid), { 'Content-Type': 'text/plain', Accept: 'application/json' })
    expect(ct.status).toBe(415)
  })

  test('想定外の例外の詳細は tool の結果に出さない', async () => {
    sqlite.query('DROP TABLE expenditure_subject').run()
    const orig = console.error
    const logged: unknown[] = []
    console.error = (...a: unknown[]) => void logged.push(a)
    try {
      const res = await mcp(toolCall(valid))
      const text = (await rpcBody(res)).result.content[0].text
      expect(JSON.parse(text).error).toEqual({ code: 'INTERNAL', message: '内部エラー' })
      expect(text).not.toContain('no such table')
      expect(String(logged[0])).toContain('no such table')
    } finally {
      console.error = orig
    }
  })

  test('REST も想定外の例外の詳細を返さない', async () => {
    sqlite.query('DROP TABLE expenditure_subject').run()
    const orig = console.error
    console.error = () => {}
    try {
      const res = await search({})
      expect(res.status).toBe(500)
      expect(JSON.stringify(await res.json())).not.toContain('no such table')
    } finally {
      console.error = orig
    }
  })

})

describe('REST の入口の検査', () => {
  test('Content-Type が JSON でないと 415、壊れた JSON は 400', async () => {
    const text = await app.request(SEARCH, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(valid) }, { DB: db })
    expect(text.status).toBe(415)
    expect((await text.json()).error.code).toBe('UNSUPPORTED_MEDIA_TYPE')
    const none = await app.request(SEARCH, { method: 'POST', body: JSON.stringify(valid) }, { DB: db })
    expect(none.status).toBe(415)
    expect((await post(SEARCH, '{"a":')).status).toBe(400)
    expect((await post(SEARCH, '')).status).toBe(400)
  })

  test('body の上限は Content-Length ではなく読んだバイト数で検査する', async () => {
    // Content-Length を小さく偽り、ストリームで大きな body を送る
    const big = new TextEncoder().encode(JSON.stringify({ x: 'a'.repeat(20000) }))
    const stream = new ReadableStream({ start(c) { c.enqueue(big.slice(0, 10000)); c.enqueue(big.slice(10000)); c.close() } })
    const res = await app.request(SEARCH, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': '10' }, body: stream, duplex: 'half' } as never, { DB: db })
    expect(res.status).toBe(413)
    // 上限ちょうどは読める
    const ok = JSON.stringify({ ...valid, pad: '' })
    expect((await post(SEARCH, ok)).status).toBe(400) // 未知のキーで 400（413 ではない）
  })

  test('UTF-8 として不正な body は 400', async () => {
    const res = await app.request(SEARCH, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]) }, { DB: db })
    expect(res.status).toBe(400)
  })

  test.each([
    ['最上位', '{"__proto__":{"a":1},"document_kind":"settlement","fiscal_year":{"min":2024,"max":2024}}'],
    ['where の中', '{"document_kind":"settlement","fiscal_year":{"min":2024,"max":2024},"where":{"name":{"__proto__":1}}}'],
    ['配列の中', '{"document_kind":"settlement","fiscal_year":{"min":2024,"max":2024},"where":{"name":{"eq":[{"__proto__":1}]}}}'],
  ])('__proto__ は %s でも 400', async (_, body) => {
    const res = await post(SEARCH, body)
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toContain('__proto__')
    expect((await mcp('{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"__proto__":1}}')).status).toBe(400)
  })

  test('constructor などは今までどおり未知のキーとして 400', async () => {
    expect((await search({ constructor: 1 })).status).toBe(400)
    expect((await search({ where: { constructor: { eq: ['x'] } } })).status).toBe(400)
  })

  test('Get の query と path は strict', async () => {
    expect((await get(`${SUBJECT(K1)}?foo=1`)).status).toBe(400)
    expect((await get(`${SUBJECT(K1)}?page_size=abc`)).status).toBe(400)
    expect((await get(`${SUBJECT(K1)}?page_size=0`)).status).toBe(400)
    expect((await get(`${SUBJECT(K1)}?page_size=1001`)).status).toBe(400)
    expect((await get(`${SUBJECT(K1)}?page_size=2`)).status).toBe(200)
  })

})

describe('応答のヘッダー', () => {
  test('成功・エラー・404・MCP のすべてに Cache-Control: no-store', async () => {
    const responses = [
      await get('/'),
      await get('/openapi.json'),
      await get(SUBJECT(K1)),
      await get(SUBJECT(id('ff'))),
      await get('/nope'),
      await search({}),
      await search({ where: { name: {} } }),
      await post(SEARCH, '{bad'),
      await mcp(toolCall(valid)),
      await mcp('{bad'),
      await get('/mcp'),
    ]
    for (const r of responses) expect(r.headers.get('Cache-Control'), String(r.status)).toBe('no-store')
  })
})

describe('入力の文字と位置', () => {
  test('NUL を含む制御文字は文字列入力で 400', async () => {
    for (const bad of ['a\u0000b', 'a\u001fb', 'a\u007fb', '\u0000']) {
      for (const where of [{ name: { eq: [bad] } }, { name: { not_eq: [bad] } }, { name: { prefix: bad } }, { name: { suffix: bad } }, { name: { contains: bad } }]) {
        const res = await search({ where })
        expect(res.status, JSON.stringify(where)).toBe(400)
      }
    }
    expect((await search({ where: { name: { eq: ['タブ\u0009'] } } })).status).toBe(400)
    expect((await search({ where: { name: { eq: ['通常 の 文字'] } } })).status).toBe(200)
  })

  test('GLOB のパターンが 50 バイトを超えると 400', async () => {
    const res = await search({ where: { name: { prefix: 'a'.repeat(50) } } })
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toContain('50 バイト')
    expect((await search({ where: { name: { prefix: 'a'.repeat(49) } } })).status).toBe(200)
  })

  test('page_token の位置は 100,000 まで', async () => {
    const token = (o: number) => btoa(JSON.stringify({ o, h: 'x' })).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
    const over = await search({ page_token: token(100001) })
    expect(over.status).toBe(400)
    expect((await over.json()).error.message).toContain('100000')
    // 上限以内なら指紋の検査に進む（別の問い合わせとして 400）
    expect((await (await search({ page_token: token(100000) })).json()).error.message).toContain('別の問い合わせ')
  })

  test('page_token の形式は base64url だけ', async () => {
    expect((await search({ page_token: 'a b' })).status).toBe(400)
    expect((await search({ page_token: 'a=' })).status).toBe(400)
  })
})

describe('行と出典は1つの batch で読む', () => {
  test('search と get は D1 の batch を1回だけ使い、行・印字の位置・出典の文を同時に渡す', async () => {
    const batches: number[] = []
    const spy: Db = { prepare: (sql) => db.prepare(sql), batch: (s) => (batches.push(s.length), db.batch(s)) }
    await app.request(SEARCH, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid) }, { DB: spy })
    await app.request(SUBJECT(K1), {}, { DB: spy })
    await app.request(`/v1/expenditures/lines/${S1}`, {}, { DB: spy })
    expect(batches).toEqual([2, 6, 6])
  })

})

describe('JSON の重複キー', () => {
  test('後勝ちで消えた側の __proto__ は検査しない。結果は where を空にした場合と同じ', async () => {
    const dup = '{"document_kind":"settlement","fiscal_year":{"min":2024,"max":2024},"where":{"__proto__":1},"where":{}}'
    const empty = '{"document_kind":"settlement","fiscal_year":{"min":2024,"max":2024},"where":{}}'
    const a = await post(SEARCH, dup)
    expect(a.status).toBe(200)
    expect(await a.json()).toEqual(await (await post(SEARCH, empty)).json())
    // 解析後に残っている __proto__ は 400
    expect((await post(SEARCH, '{"document_kind":"settlement","fiscal_year":{"min":2024,"max":2024},"where":{},"where":{"__proto__":1}}')).status).toBe(400)
  })
})

describe('MCP 2026-07-28', () => {
  // 2026-07-28 の要求は initialize なしで、毎回 _meta の envelope と標準ヘッダを付ける
  const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} }
  const modern = (method: string, params: Record<string, unknown> = {}, extra: Record<string, string> = {}) =>
    mcp(
      { jsonrpc: '2.0', id: 1, method, params: { ...params, _meta: meta } },
      { ...MCP_HEADERS, 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': method, ...extra }
    )

  test('initialize なしで tools/list と tools/call が通る', async () => {
    const list = await rpcBody(await modern('tools/list'))
    expect(list.result.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      'get_budget_proposal',
      'get_evaluation',
      'get_evaluation_sheet',
      'get_expenditure_line',
      'get_project',
      'list_jurisdictions',
      'render_expenditure_view',
      'search_budget_measures',
      'search_evaluation_sheets',
      'search_expenditure_details',
      'search_expenditure_subjects',
      'search_projects',
    ])
    const res = await modern('tools/call', { name: 'search_expenditure_subjects', arguments: valid }, { 'Mcp-Name': 'search_expenditure_subjects' })
    const body = await rpcBody(res)
    expect(body.result.isError).toBeUndefined()
    expect(JSON.parse(body.result.content[0].text).subjects.length).toBeGreaterThan(0)
  })

  test('Mcp-Method ヘッダが無い要求は検索を実行せずに断る', async () => {
    const calls: string[] = []
    const spy: Db = { prepare: (sql) => (calls.push(sql), db.prepare(sql)), batch: (s) => db.batch(s) }
    const orig = console.error
    console.error = () => {} // SDK が拒否を onerror 経由でログに出す
    let res: Response
    try {
      res = await app.request(
        '/mcp',
        {
          method: 'POST',
          headers: { ...MCP_HEADERS, 'MCP-Protocol-Version': '2026-07-28' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_expenditure_subjects', arguments: valid, _meta: meta } }),
        },
        { DB: spy }
      )
    } finally {
      console.error = orig
    }
    expect(res.status).toBe(400)
    expect(calls.filter((c) => c.includes('expenditure_subject'))).toEqual([])
  })

  test('subscriptions/listen は長い SSE を開かずに 400 で断る。listChanged は名乗らない', async () => {
    const res = await modern('subscriptions/listen', { notifications: { toolsListChanged: true } })
    expect(res.status).toBe(400)
    expect(res.headers.get('Content-Type')).toContain('application/json')
    expect((await res.json()).error.code).toBe(-32601)
    const discover = await rpcBody(await modern('server/discover'))
    expect(discover.result.capabilities.tools.listChanged).toBe(false)
  })

  test('batch は 2026-07-28 の形でも 400 で、検索は実行されない', async () => {
    const calls: string[] = []
    const spy: Db = { prepare: (sql) => (calls.push(sql), db.prepare(sql)), batch: (s) => db.batch(s) }
    const one = (id: number) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'search_expenditure_subjects', arguments: valid, _meta: meta } })
    const res = await app.request('/mcp', { method: 'POST', headers: { ...MCP_HEADERS, 'MCP-Protocol-Version': '2026-07-28' }, body: JSON.stringify([one(1), one(2)]) }, { DB: spy })
    expect(res.status).toBe(400)
    expect(calls.filter((c) => c.includes('expenditure_subject'))).toEqual([])
  })
})

describe('operation の応答は output の schema に合う', () => {
  // marts の列と columns.json がずれたら、実行時ではなくここで落とす。
  // 上の fixture は列を疎にしているので、この describe では非 NULL の列を columns.json から全部埋めた行を使う。
  // 決算と当初予算で ID が違う（同じ node_key の行でも別の行）
  const IDS = { settlement: { P: id('e1'), C: id('e2'), D: id('e3') }, initial: { P: id('f1'), C: id('f2'), D: id('f3') } } as const
  const filled = (table: string, row: Record<string, string | number>) => {
    const cols = (columnsJson as unknown as { tables: Record<string, { columns: { name: string; type: string; nullable: boolean }[] }> }).tables[table]!.columns
    const dflt = (type: string) => (type === 'string' ? 'x' : 1)
    return { ...Object.fromEntries(cols.filter((c) => !c.nullable).map((c) => [c.name, dflt(c.type)])), ...row }
  }
  beforeEach(() => {
    insertOrigin(sqlite, filled('expenditure_origin', { origin_id: 'of', fiscal_year: 2023, sha256: 'f'.repeat(64) }))
    for (const document_kind of ['settlement', 'initial'] as const) {
      const { P, C, D } = IDS[document_kind]
      const amount_phase = document_kind === 'settlement' ? 'executed' : 'approved'
      insertSubject(sqlite, filled('expenditure_subject', { document_kind, amount_phase, subject_id: P, fiscal_year: 2023, origin_id: 'of', level: '款', is_leaf: 0 }))
      insertSubject(sqlite, filled('expenditure_subject', { document_kind, amount_phase, subject_id: C, parent_subject_id: P, fiscal_year: 2023, origin_id: 'of', level: '目', is_leaf: 1 }))
      insertDetail(sqlite, filled('expenditure_detail', { document_kind, amount_phase, detail_id: D, subject_id: C, fiscal_year: 2023, origin_id: 'of', breakdown: '事業', depth: 1 }))
    }
  })

  const run = (name: string, input: unknown) => {
    const op = operations.find((o) => o.name === name)!
    return op.run({ db }, op.input.parse(input) as never)
  }
  const parse = (name: string, out: unknown) => {
    const result = operations.find((o) => o.name === name)!.output.safeParse(out)
    expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true)
  }
  const year = { min: 2023, max: 2023 }

  test('search_expenditure_subjects・details（決算・当初予算・空の結果・次ページ）', async () => {
    for (const document_kind of ['settlement', 'initial']) {
      const out = (await run('search_expenditure_subjects', { document_kind, fiscal_year: year })) as { subjects: unknown[]; origins: unknown[] }
      expect(out.subjects).toHaveLength(2)
      expect(out.origins).toHaveLength(1)
      parse('search_expenditure_subjects', out)
      const details = (await run('search_expenditure_details', { document_kind, fiscal_year: year })) as { details: unknown[] }
      expect(details.details).toHaveLength(1)
      parse('search_expenditure_details', details)
    }
    parse('search_expenditure_subjects', await run('search_expenditure_subjects', { document_kind: 'settlement', fiscal_year: year, where: { name: { eq: ['存在しない'] } } }))
    const paged = (await run('search_expenditure_subjects', { document_kind: 'settlement', fiscal_year: year, page_size: 1 })) as { next_page_token: string | null }
    expect(paged.next_page_token).toBeString()
    parse('search_expenditure_subjects', paged)
  })

  test('get_expenditure_line（子のある款・内訳のある目・内訳）', async () => {
    for (const document_kind of ['settlement', 'initial'] as const) {
      const { P, C, D } = IDS[document_kind]
      for (const line_id of [P, C, D]) parse('get_expenditure_line', await run('get_expenditure_line', { line_id }))
    }
  })

  // client は tools/list の outputSchema（JSON Schema）で structuredContent を検証する。zod の parse は未知のキーを黙って落とすので、
  // zod だけだと「データにあるのに schema に無い」ずれを見逃す。client が見るものを、本物の JSON Schema の validator で確かめる。
  test('tools/call の structuredContent が tools/list の outputSchema（JSON Schema）に通る', async () => {
    const list = await rpcBody(await mcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))
    const validators = new CfWorkerJsonSchemaValidator()
    const validate = (name: string, data: unknown) => {
      const schema = list.result.tools.find((t: { name: string }) => t.name === name).outputSchema
      const result = validators.getValidator(schema)(data)
      expect(result.valid, `${name}: ${result.valid ? '' : result.errorMessage}`).toBe(true)
    }
    const call = async (name: string, args: unknown) => {
      const body = await rpcBody(await mcp({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }))
      expect(body.result.isError, name).toBeUndefined()
      return body.result.structuredContent
    }
    for (const document_kind of ['settlement', 'initial'] as const) {
      const { P, C, D } = IDS[document_kind]
      validate('search_expenditure_subjects', await call('search_expenditure_subjects', { document_kind, fiscal_year: year, page_size: 1 }))
      validate('search_expenditure_details', await call('search_expenditure_details', { document_kind, fiscal_year: year, page_size: 1 }))
      for (const line_id of [P, C, D]) validate('get_expenditure_line', await call('get_expenditure_line', { line_id }))
    }
    // 検査自体が効いていること: schema に無いキー・列挙に無い値・判別子の誤りは通らない
    const schema = list.result.tools.find((t: { name: string }) => t.name === 'get_expenditure_line').outputSchema
    const line = await call('get_expenditure_line', { line_id: IDS.settlement.C })
    const validator = validators.getValidator(schema)
    expect(validator(line).valid).toBe(true)
    expect(validator({ ...line, extra: 1 }).valid).toBe(false)
    expect(validator({ ...line, line: { ...line.line, level: '節' } }).valid).toBe(false)
    expect(validator({ ...line, line: { ...line.line, kind: 'detail' } }).valid).toBe(false)
  })
})
