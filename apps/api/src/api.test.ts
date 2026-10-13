import { beforeEach, describe, expect, test } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { createApp } from './app'
import columnsJson from './columns.json'
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/server/validators/cf-worker'
import { operations } from './operations'
import type { Db } from './db'
import { insertNode, insertOrigin, testDb } from './testing'

let db: Db
let sqlite: Database
const app = createApp()

// node_id は小文字 16 進 64 文字
const id = (prefix: string) => prefix.padEnd(64, '0')
const [K1, M1, M2, S1, OLD] = [id('a1'), id('b1'), id('b2'), id('c1'), id('d1')]

/** MCP の応答の body。2025 年代の client には SDK が SSE（`data: {...}`）で返し、2026-07-28 の要求には JSON で返す。 */
const rpcBody = async (res: Response) => {
  const text = await res.text()
  const data = /^data: (.*)$/m.exec(text)
  return JSON.parse(data ? data[1]! : text)
}

/** JSON Schema の `$ref`（`#/...`）を root から辿って開く。共通の schema は $defs / components に一度だけ出る。 */
const deref = (root: unknown, node: any): any => {
  if (typeof node?.$ref !== 'string') return node
  return deref(root, node.$ref.slice(2).split('/').reduce((o: any, k: string) => o[k], root))
}

const get = (path: string) => app.request(path, {}, { DB: db })
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(
    path,
    { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) },
    { DB: db }
  )
const SEARCH = '/v1/expenditure/nodes:search'
const search = (body: Record<string, unknown>) => post(SEARCH, { document_kind: 'settlement', fiscal_year: { min: 2024, max: 2024 }, ...body })
const ids = (body: { nodes: { node_id: string }[] }) => body.nodes.map((n) => n.node_id)

beforeEach(() => {
  ;({ db, sqlite } = testDb())
  insertOrigin(sqlite, { origin_id: 'o1', title: '決算書', url: 'https://example.test/o1', sha256: 'aaa' })
  insertOrigin(sqlite, { origin_id: 'o2', title: '決算書2', url: 'https://example.test/o2', sha256: 'bbb' })
  insertNode(sqlite, { document_kind: 'settlement', node_id: K1, node_kind: '款', axis: '科目', name: '総務費', amount_yen: 900, is_leaf: 0, is_subject: 1, origin_id: 'o1' })
  insertNode(sqlite, { document_kind: 'settlement', node_id: M1, parent_node_id: K1, node_kind: '目', axis: '科目', name: '庁舎管理費', amount_yen: 500, is_leaf: 1, cofog_code: '01.3', origin_id: 'o1' })
  insertNode(sqlite, { document_kind: 'settlement', node_id: M2, parent_node_id: K1, node_kind: '目', axis: '科目', name: '広報費', amount_yen: 400, is_leaf: 1, cofog_code: '01.3', origin_id: 'o1' })
  insertNode(sqlite, { document_kind: 'settlement', node_id: S1, parent_node_id: K1, node_kind: '節', axis: '節', name: '委託料', amount_yen: 900, is_leaf: 1, origin_id: 'o2' })
  insertNode(sqlite, { document_kind: 'initial', node_id: K1, node_kind: '款', axis: '科目', name: '総務費', amount_yen: 950, origin_id: 'o1' })
  insertNode(sqlite, { document_kind: 'settlement', node_id: OLD, fiscal_year: 2019, node_kind: '目', name: '古い', amount_yen: 1 })
})

describe('kill switch', () => {
  test('serving が on 以外なら全パスで 503 と no-store', async () => {
    sqlite.query(`UPDATE control SET value = 'off' WHERE key = 'serving'`).run()
    for (const path of ['/', '/openapi.json', '/v1/expenditure/columns']) {
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

  test('GET 以外は 405', async () => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const res = await app.request('/health', { method, headers: { 'Content-Type': 'text/plain' }, body: 'x' }, { DB: db })
      expect(res.status, method).toBe(405)
      expect(res.headers.get('Allow')).toBe('GET')
      expect(res.headers.get('Cache-Control')).toBe('no-store')
    }
  })

  test('OpenAPI に載り、MCP の tool にはならない', async () => {
    const doc = await (await get('/openapi.json')).json()
    expect(doc.paths['/health'].get.operationId).toBe('health')
    const res = await mcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    expect((await rpcBody(res)).result.tools.map((t: { name: string }) => t.name)).not.toContain('health')
  })

  test('/ の案内に health の URL', async () => {
    expect((await (await get('http://x.test/')).json()).health).toBe('http://x.test/health')
  })
})

describe('GET /', () => {
  test('REST と MCP の URL を返す', async () => {
    const body = await (await get('http://x.test/')).json()
    expect(body.mcp).toBe('http://x.test/mcp')
    expect(body.rest).toBe('http://x.test/v1/expenditure/nodes:search')
  })
})

describe('search', () => {
  test('絞り込み・boolean の復元・origins は一度ずつ', async () => {
    const res = await search({ where: { node_kind: { eq: ['目'] } }, order_by: [{ column: 'amount_yen', desc: true }] })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(ids(body)).toEqual([M1, M2])
    expect(body.nodes[0].is_leaf).toBe(true)
    expect(body.nodes[0].parent_node_id).toBe(K1)
    expect(body.nodes[0].cofog_status).toBeNull()
    expect(body.next_page_token).toBeNull()
    expect(body.origins).toHaveLength(1)
    expect(body.origins[0].origin_id).toBe('o1')
  })

  test('document_kind で表を選び、行には document_kind が付く', async () => {
    const body = await (await post(SEARCH, { document_kind: 'initial', fiscal_year: { min: 2024, max: 2024 } })).json()
    expect(body.nodes).toHaveLength(1)
    expect(body.nodes[0].document_kind).toBe('initial')
    expect(Object.keys(body.nodes[0])[0]).toBe('document_kind')
    expect(body.nodes[0].amount_yen).toBe(950)
  })

  test('年度の範囲', async () => {
    const body = await (await search({ fiscal_year: { min: 2019, max: 2020 } })).json()
    expect(ids(body)).toEqual([OLD])
    expect((await search({ fiscal_year: { min: 2019, max: 2023 } })).status).toBe(200) // 5年は通る
  })

  test('条件の型ごとの組み立て', async () => {
    const run = async (where: Record<string, unknown>) => ids(await (await search({ where })).json())
    expect(await run({ cofog_code: { prefix: '01.' } })).toEqual([M1, M2].sort())
    expect(await run({ name: { suffix: '管理費' } })).toEqual([M1])
    expect(await run({ name: { contains: '報' } })).toEqual([M2])
    expect(await run({ name: { eq: ['広報費', '委託料'] } })).toEqual([M2, S1].sort())
    expect(await run({ node_kind: { not_eq: ['目', '節'] } })).toEqual([K1])
    expect(await run({ cofog_code: { is_null: true }, node_kind: { eq: ['款'] } })).toEqual([K1])
    expect(await run({ amount_yen: { min: 500, max: 500 }, node_kind: { eq: ['目'] } })).toEqual([M1])
    expect(await run({ amount_yen: { not_eq: [900] }, node_kind: { eq: ['目'] } })).toEqual([M1, M2].sort())
    expect(await run({ is_leaf: { eq: false } })).toEqual([K1])
  })

  test('GLOB の特殊文字は escape される', async () => {
    insertNode(sqlite, { document_kind: 'settlement', node_id: id('e1'), name: 'a*b[c]?' })
    insertNode(sqlite, { document_kind: 'settlement', node_id: id('e2'), name: 'axb' })
    const body = await (await search({ where: { name: { prefix: 'a*b' } } })).json()
    expect(ids(body)).toEqual([id('e1')])
    expect(ids(await (await search({ where: { name: { contains: '[c]?' } } })).json())).toEqual([id('e1')])
  })

  test('ページングは order_by の末尾に node_id を足して順序を決める', async () => {
    const base = { order_by: [{ column: 'axis' }], page_size: 2 }
    const page1 = await (await search(base)).json()
    expect(page1.nodes).toHaveLength(2)
    expect(page1.next_page_token).toBeString()
    const page2 = await (await search({ ...base, page_token: page1.next_page_token })).json()
    expect(page2.next_page_token).toBeNull()
    expect([...ids(page1), ...ids(page2)]).toEqual([K1, M1, M2, S1]) // axis 科目 → 節、同じ軸は node_id 順
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

  test('キーの順が違っても指紋は同じ', async () => {
    const page1 = await (await post(SEARCH, { page_size: 1, fiscal_year: { max: 2024, min: 2024 }, document_kind: 'settlement' })).json()
    const next = await search({ page_size: 1, page_token: page1.next_page_token })
    expect(next.status).toBe(200)
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
    const eq = Array.from({ length: 89 }, (_, i) => `n${i}`) // 年 1 つと合わせて 90
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
    expect(body.nodes).toEqual([])
    expect(sqlite.query('SELECT count(*) AS n FROM control').get()).toEqual({ n: 1 })
  })

  test('旧 GET の一覧は無い', async () => {
    expect((await get('/v1/expenditure/nodes?filter=x')).status).toBe(404)
  })
})

describe('get', () => {
  test('ノードと軸ごとの子', async () => {
    const res = await get(`/v1/expenditure/nodes/settlement/${K1}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.node.node_id).toBe(K1)
    expect(Object.keys(body.children).sort()).toEqual(['科目', '節'])
    expect(body.children['科目'].map((n: { node_id: string }) => n.node_id)).toEqual([M1, M2])
    expect(body.next_page_token).toBeNull()
    expect(body.origins.map((o: { origin_id: string }) => o.origin_id)).toEqual(['o1', 'o2'])
  })

  test('子のページング', async () => {
    const p1 = await (await get(`/v1/expenditure/nodes/settlement/${K1}?page_size=2`)).json()
    expect(p1.next_page_token).toBeString()
    const p2 = await (await get(`/v1/expenditure/nodes/settlement/${K1}?page_size=2&page_token=${p1.next_page_token}`)).json()
    expect(Object.values(p2.children).flat()).toHaveLength(1)
    expect((await get(`/v1/expenditure/nodes/initial/${K1}?page_token=${p1.next_page_token}`)).status).toBe(400)
  })

  test('資料区分が違えば別のノード、無ければ 404、補正と不正な node_id は 400', async () => {
    expect((await (await get(`/v1/expenditure/nodes/initial/${K1}`)).json()).node.amount_yen).toBe(950)
    const missing = await get(`/v1/expenditure/nodes/settlement/${id('ff')}`)
    expect(missing.status).toBe(404)
    expect((await missing.json()).error.code).toBe('NOT_FOUND')
    expect((await get(`/v1/expenditure/nodes/supplementary/${K1}`)).status).toBe(400)
    expect((await get('/v1/expenditure/nodes/settlement/k1')).status).toBe(400)
    expect((await get(`/v1/expenditure/nodes/settlement/${K1.toUpperCase()}`)).status).toBe(400)
  })
})

describe('columns と OpenAPI', () => {
  test('列の説明に和の条件と必須条件と例が添えられる', async () => {
    const body = await (await get('/v1/expenditure/columns')).json()
    expect(body.columns.length).toBeGreaterThan(20)
    expect(body.columns[0].name).toBe('document_kind')
    expect(body.where_columns).toContain('cofog_code')
    expect(body.where_columns).not.toContain('fiscal_year')
    expect(body.sum_rules.length).toBe(5)
    expect(body.required_input).toContain('document_kind')
    expect(body.search_example.fiscal_year).toEqual({ min: 2025, max: 2025 })
    expect(JSON.stringify(body)).not.toContain('AIP-160')
  })

  test('nullable が false の列は OpenAPI の応答で非 null', async () => {
    const doc = await (await get('/openapi.json')).json()
    const node = deref(doc, doc.paths['/v1/expenditure/nodes:search'].post.responses['200'].content['application/json'].schema.properties.nodes.items)
    expect(node.properties.node_id.type).toBe('string')
    expect(JSON.stringify(node.properties.node_kind)).not.toContain('null')
    expect(JSON.stringify(node.properties.cofog_code)).toContain('null')
  })

  test('/openapi.json は 3.1 で、search は POST の body schema を持つ', async () => {
    const doc = await (await get('/openapi.json')).json()
    expect(doc.openapi).toBe('3.1.0')
    expect(Object.keys(doc.paths).sort()).toEqual([
      '/health',
      '/v1/expenditure/columns',
      '/v1/expenditure/nodes/{document_kind}/{node_id}',
      '/v1/expenditure/nodes:search',
    ])
    const schema = doc.paths['/v1/expenditure/nodes:search'].post.requestBody.content['application/json'].schema
    expect(schema.additionalProperties).toBe(false)
    expect(schema.required).toEqual(expect.arrayContaining(['document_kind', 'fiscal_year']))
    expect(schema.properties.document_kind.enum).toEqual(['settlement', 'initial'])
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
    const list = await rpc('tools/list')
    expect(list.body.result.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      'describe_expenditure_columns',
      'get_expenditure_node',
      'search_expenditure_nodes',
    ])
    const res = await call('search_expenditure_nodes', { ...base, where: { node_kind: { eq: ['目'] } }, page_size: 1 })
    const out = JSON.parse(res.body.result.content[0].text)
    expect(out.nodes).toHaveLength(1)
    expect(out.next_page_token).toBeString()
    expect(res.body.result.isError).toBeUndefined()
  })

  test('tool の入力 schema に制約が出る', async () => {
    const { body } = await rpc('tools/list')
    const tools = Object.fromEntries(body.result.tools.map((t: { name: string }) => [t.name, t]))
    const schema = tools.search_expenditure_nodes.inputSchema
    expect(schema.additionalProperties).toBe(false)
    expect(schema.required).toEqual(expect.arrayContaining(['document_kind', 'fiscal_year']))
    expect(schema.properties.document_kind.enum).toEqual(['settlement', 'initial'])
    expect(schema.properties.page_size.minimum).toBe(1)
    expect(schema.properties.page_size.maximum).toBe(1000)
    expect(schema.properties.order_by.maxItems).toBe(5)
    expect(schema.properties.where.additionalProperties).toBe(false)
    const name = deref(schema, schema.properties.where.properties.name)
    expect(name.properties.eq.maxItems).toBe(100)
    expect(name.properties.eq.minItems).toBe(1)
    expect(schema.properties.fiscal_year.properties.min.minimum).toBe(1)
    expect(schema.properties.fiscal_year.properties.max.maximum).toBe(9999)
    expect(tools.search_expenditure_nodes.description).toContain('sum_rules')
    const getToken = tools.get_expenditure_node.inputSchema.properties.page_token.description
    expect(getToken).toContain('node_id')
    expect(getToken).not.toContain('filter')
    expect(tools.get_expenditure_node.inputSchema.properties.node_id.pattern).toBeString()
  })

  test('入力の誤りは tool の結果として返る（isError か JSON-RPC の error）', async () => {
    const bad = await call('search_expenditure_nodes', { document_kind: 'settlement' })
    const failed = bad.body.error !== undefined || bad.body.result.isError === true
    expect(failed).toBe(true)
    const get404 = await call('get_expenditure_node', { document_kind: 'settlement', node_id: id('ff') })
    expect(get404.body.result.isError).toBe(true)
    expect(JSON.parse(get404.body.result.content[0].text).error.code).toBe('NOT_FOUND')
  })

  test('POST 以外は 405', async () => {
    expect((await get('/mcp')).status).toBe(405)
  })
})

const MCP_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }
const mcp = (body: string | unknown, headers: Record<string, string> = MCP_HEADERS) =>
  app.request('/mcp', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }, { DB: db })
const toolCall = (args: unknown, id = 1) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'search_expenditure_nodes', arguments: args } })
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
    expect(calls.filter((c) => c.includes('settlement_expenditure_node'))).toEqual([])
    expect((await mcp([])).status).toBe(400)
  })

  test('単一の要求は通る', async () => {
    const res = await mcp(toolCall(valid))
    expect(res.status).toBe(200)
    expect((await rpcBody(res)).result.isError).toBeUndefined()
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
    sqlite.query('DROP TABLE settlement_expenditure_node').run()
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
    sqlite.query('DROP TABLE settlement_expenditure_node').run()
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

  test('MCP の Get は page_size の型を強制しない', async () => {
    for (const page_size of [true, [], null, '5', 1.5, 0, 1001]) {
      const res = await mcp({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_expenditure_node', arguments: { document_kind: 'settlement', node_id: K1, page_size } } })
      expect((await rpcBody(res)).result.isError, JSON.stringify(page_size)).toBe(true)
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

  test('Content-Type の大文字小文字と charset は許す', async () => {
    const res = await app.request(SEARCH, { method: 'POST', headers: { 'Content-Type': 'Application/JSON; charset=utf-8' }, body: JSON.stringify(valid) }, { DB: db })
    expect(res.status).toBe(200)
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
    expect((await get(`/v1/expenditure/nodes/settlement/${K1}?foo=1`)).status).toBe(400)
    expect((await get(`/v1/expenditure/nodes/settlement/${K1}?page_size=abc`)).status).toBe(400)
    expect((await get(`/v1/expenditure/nodes/settlement/${K1}?page_size=0`)).status).toBe(400)
    expect((await get(`/v1/expenditure/nodes/settlement/${K1}?page_size=1001`)).status).toBe(400)
    expect((await get(`/v1/expenditure/nodes/settlement/${K1}?page_size=2`)).status).toBe(200)
    expect((await get('/v1/expenditure/columns?foo=1')).status).toBe(400)
  })

  test('存在しないパスは JSON の 404', async () => {
    const res = await get('/nope')
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('NOT_FOUND')
  })
})

describe('応答のヘッダー', () => {
  test('成功・エラー・404・MCP のすべてに Cache-Control: no-store', async () => {
    const responses = [
      await get('/'),
      await get('/openapi.json'),
      await get('/v1/expenditure/columns'),
      await get(`/v1/expenditure/nodes/settlement/${K1}`),
      await get(`/v1/expenditure/nodes/settlement/${id('ff')}`),
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

describe('ノードと原典は1つの batch で読む', () => {
  test('search と get は D1 の batch を1回だけ使い、ノードと原典の文を同時に渡す', async () => {
    const batches: number[] = []
    const spy: Db = { prepare: (sql) => db.prepare(sql), batch: (s) => (batches.push(s.length), db.batch(s)) }
    await app.request(SEARCH, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid) }, { DB: spy })
    await app.request(`/v1/expenditure/nodes/settlement/${K1}`, {}, { DB: spy })
    expect(batches).toEqual([2, 3])
  })

  test('原典は返したページの行が指すものだけ', async () => {
    // 1ページ目の 1 件だけなら o1 だけ。2 ページ目に o2 が入る
    const p1 = await (await search({ order_by: [{ column: 'name' }], page_size: 1, where: { node_kind: { eq: ['目', '節'] } } })).json()
    expect(p1.origins.map((o: { origin_id: string }) => o.origin_id)).toEqual(['o2']) // 委託料（節）
    const p2 = await (await search({ order_by: [{ column: 'name' }], page_size: 1, where: { node_kind: { eq: ['目', '節'] } }, page_token: p1.next_page_token })).json()
    expect(p2.origins.map((o: { origin_id: string }) => o.origin_id)).toEqual(['o1'])
  })
})

describe('offset の上限', () => {
  const MAX = 100_000
  const fill = (parent: string | null) =>
    sqlite
      .query(
        `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 102500)
         INSERT INTO settlement_expenditure_node (node_id, parent_node_id, fiscal_year, jurisdiction_code)
         SELECT '1' || substr(printf('%063x', i), 1, 63), ?, 2025, '132039' FROM n`
      )
      .run(parent)

  test('search は次の位置が上限を超えるなら next_page_token を出さず、出した token は必ず使える', async () => {
    fill(null)
    const body = { document_kind: 'settlement', fiscal_year: { min: 2025, max: 2025 }, page_size: 1000 }
    let token: string | null = null
    let pages = 0
    let last = 0
    for (let i = 0; i < 200; i++) {
      const res = await post(SEARCH, token ? { ...body, page_token: token } : body)
      expect(res.status, `page ${i}`).toBe(200)
      const json = await res.json()
      last = json.nodes.length
      pages++
      token = json.next_page_token
      if (token === null) break
    }
    expect(pages).toBe(MAX / 1000 + 1) // offset 0, 1000, ..., 100,000
    expect(last).toBe(1000) // まだ行はあるのに打ち切る
  }, 120000)

  test('get の子も同じ', async () => {
    fill(K1)
    let token: string | null = null
    let pages = 0
    for (let i = 0; i < 200; i++) {
      const res = await get(`/v1/expenditure/nodes/settlement/${K1}?page_size=1000${token ? `&page_token=${token}` : ''}`)
      expect(res.status, `page ${i}`).toBe(200)
      token = (await res.json()).next_page_token
      pages++
      if (token === null) break
    }
    expect(pages).toBe(MAX / 1000 + 1)
  }, 120000)

  test('打ち切りの説明が tool と OpenAPI にある', async () => {
    const res = await mcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    const body = await rpcBody(res)
    for (const tool of body.result.tools.filter((t: { name: string }) => t.name !== 'describe_expenditure_columns') as { name: string; outputSchema: any }[])
      expect(tool.outputSchema.properties.next_page_token.description, tool.name).toContain('それ以上')
    const doc = await (await get('/openapi.json')).json()
    const schema = doc.paths['/v1/expenditure/nodes:search'].post.responses['200'].content['application/json'].schema
    expect(schema.properties.next_page_token.description).toContain('条件を絞って')
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

  test('server/discover は 2026-07-28 を名乗り、JSON で返る', async () => {
    const res = await modern('server/discover')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('application/json')
    const body = await rpcBody(res)
    expect(body.result.supportedVersions).toContain('2026-07-28')
    expect(body.result._meta['io.modelcontextprotocol/serverInfo'].name).toBe('fudoki-api')
  })

  test('initialize なしで tools/list と tools/call が通る', async () => {
    const list = await rpcBody(await modern('tools/list'))
    expect(list.result.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      'describe_expenditure_columns',
      'get_expenditure_node',
      'search_expenditure_nodes',
    ])
    const res = await modern('tools/call', { name: 'search_expenditure_nodes', arguments: valid }, { 'Mcp-Name': 'search_expenditure_nodes' })
    const body = await rpcBody(res)
    expect(body.result.isError).toBeUndefined()
    expect(JSON.parse(body.result.content[0].text).nodes.length).toBeGreaterThan(0)
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
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_expenditure_nodes', arguments: valid, _meta: meta } }),
        },
        { DB: spy }
      )
    } finally {
      console.error = orig
    }
    expect(res.status).toBe(400)
    expect(calls.filter((c) => c.includes('settlement_expenditure_node'))).toEqual([])
  })

  test('2025 年代の要求（initialize → tools/call）も1要求ずつ通る', async () => {
    const init = await rpcBody(await mcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } } }))
    expect(init.result.protocolVersion).toBe('2025-03-26')
    expect(init.result.serverInfo.name).toBe('fudoki-api')
    const res = await mcp(toolCall(valid))
    expect(res.status).toBe(200)
    expect(JSON.parse((await rpcBody(res)).result.content[0].text).nodes.length).toBeGreaterThan(0)
  })

  test('tools/list の tool に title・読み取り専用の注釈・outputSchema があり、共通の schema は $defs に一度だけ出る', async () => {
    for (const body of [await rpcBody(await modern('tools/list')), await rpcBody(await mcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))]) {
      expect(body.result.tools).toHaveLength(operations.length)
      for (const tool of body.result.tools as { name: string; title: string; annotations: unknown; outputSchema?: unknown }[]) {
        const op = operations.find((o) => o.name === tool.name)!
        expect(tool.title, tool.name).toBe(op.summary)
        expect(tool.annotations, tool.name).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false })
        expect(tool.outputSchema, tool.name).toBeObject()
      }
      const search = body.result.tools.find((t: { name: string }) => t.name === 'search_expenditure_nodes')
      expect(Object.keys(search.outputSchema.$defs).sort()).toEqual(['Node', 'Origin'])
      expect(JSON.stringify(search.outputSchema).match(/"Node"/g)).toHaveLength(1)
    }
  })

  test('tools/call は structuredContent を返し、text はその写し。エラーは isError の text だけ', async () => {
    for (const body of [await rpcBody(await modern('tools/call', { name: 'get_expenditure_node', arguments: { document_kind: 'settlement', node_id: K1 } }, { 'Mcp-Name': 'get_expenditure_node' })), await rpcBody(await mcp(toolCall(valid)))]) {
      expect(body.result.isError).toBeUndefined()
      expect(body.result.structuredContent).toEqual(JSON.parse(body.result.content[0].text))
    }
    const err = await rpcBody(await modern('tools/call', { name: 'get_expenditure_node', arguments: { document_kind: 'settlement', node_id: id('ff') } }, { 'Mcp-Name': 'get_expenditure_node' }))
    expect(err.result.isError).toBe(true)
    expect(err.result.structuredContent).toBeUndefined()
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
    const one = (id: number) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'search_expenditure_nodes', arguments: valid, _meta: meta } })
    const res = await app.request('/mcp', { method: 'POST', headers: { ...MCP_HEADERS, 'MCP-Protocol-Version': '2026-07-28' }, body: JSON.stringify([one(1), one(2)]) }, { DB: spy })
    expect(res.status).toBe(400)
    expect(calls.filter((c) => c.includes('settlement_expenditure_node'))).toEqual([])
  })
})

describe('operation の応答は output の schema に合う', () => {
  // marts の列と columns.json がずれたら、実行時ではなくここで落とす。
  // 上の fixture は列を疎にしているので、この describe では非 NULL の列を columns.json から全部埋めた行を使う。
  const [P, C] = [id('e1'), id('e2')]
  const filled = (table: string, row: Record<string, string | number>) => {
    const cols = (columnsJson as unknown as { tables: Record<string, { columns: { name: string; type: string; nullable: boolean }[] }> }).tables[table]!.columns
    const dflt = (type: string) => (type === 'string' ? 'x' : 1)
    return { ...Object.fromEntries(cols.filter((c) => !c.nullable).map((c) => [c.name, dflt(c.type)])), ...row }
  }
  beforeEach(() => {
    insertOrigin(sqlite, filled('origin', { origin_id: 'of', fiscal_year: 2023, sha256: 'f'.repeat(64) }))
    for (const document_kind of ['settlement', 'initial'] as const) {
      const table = `${document_kind}_expenditure_node`
      insertNode(sqlite, { document_kind, ...filled(table, { node_id: P, fiscal_year: 2023, origin_id: 'of', node_kind: '款', is_leaf: 0 }) })
      insertNode(sqlite, { document_kind, ...filled(table, { node_id: C, parent_node_id: P, fiscal_year: 2023, origin_id: 'of', node_kind: '目', is_leaf: 1 }) })
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

  test('search_expenditure_nodes（決算・当初予算・空の結果・次ページ）', async () => {
    for (const document_kind of ['settlement', 'initial']) {
      const out = (await run('search_expenditure_nodes', { document_kind, fiscal_year: year })) as { nodes: unknown[]; origins: unknown[] }
      expect(out.nodes).toHaveLength(2)
      expect(out.origins).toHaveLength(1)
      parse('search_expenditure_nodes', out)
    }
    parse('search_expenditure_nodes', await run('search_expenditure_nodes', { document_kind: 'settlement', fiscal_year: year, where: { name: { eq: ['存在しない'] } } }))
    const paged = (await run('search_expenditure_nodes', { document_kind: 'settlement', fiscal_year: year, page_size: 1 })) as { next_page_token: string | null }
    expect(paged.next_page_token).toBeString()
    parse('search_expenditure_nodes', paged)
  })

  test('get_expenditure_node（子のある款・子のない目）', async () => {
    for (const document_kind of ['settlement', 'initial'])
      for (const node_id of [P, C]) parse('get_expenditure_node', await run('get_expenditure_node', { document_kind, node_id }))
  })

  test('describe_expenditure_columns', async () => {
    parse('describe_expenditure_columns', await run('describe_expenditure_columns', {}))
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
    for (const document_kind of ['settlement', 'initial']) {
      validate('search_expenditure_nodes', await call('search_expenditure_nodes', { document_kind, fiscal_year: year, page_size: 1 }))
      for (const node_id of [P, C]) validate('get_expenditure_node', await call('get_expenditure_node', { document_kind, node_id }))
    }
    validate('describe_expenditure_columns', await call('describe_expenditure_columns', {}))
    // 検査自体が効いていること: schema に無いキーは落とす
    const schema = list.result.tools.find((t: { name: string }) => t.name === 'describe_expenditure_columns').outputSchema
    expect(validators.getValidator(schema)({ ...(await call('describe_expenditure_columns', {})), extra: 1 }).valid).toBe(false)
  })
})
