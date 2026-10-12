import { beforeEach, describe, expect, test } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { createApp } from './app'
import type { Db } from './db'
import { insertNode, insertOrigin, testDb } from './testing'

let db: Db
let sqlite: Database
const app = createApp()

// node_id は小文字 16 進 64 文字
const id = (prefix: string) => prefix.padEnd(64, '0')
const [K1, M1, M2, S1, OLD] = [id('a1'), id('b1'), id('b2'), id('c1'), id('d1')]

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
    const eq = Array.from({ length: 88 }, (_, i) => `n${i}`) // fiscal_year の 2 つと合わせて 90
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
    const node = doc.paths['/v1/expenditure/nodes:search'].post.responses['200'].content['application/json'].schema.properties.nodes.items
    expect(node.properties.node_id.type).toBe('string')
    expect(JSON.stringify(node.properties.node_kind)).not.toContain('null')
    expect(JSON.stringify(node.properties.cofog_code)).toContain('null')
  })

  test('/openapi.json は 3.1 で、search は POST の body schema を持つ', async () => {
    const doc = await (await get('/openapi.json')).json()
    expect(doc.openapi).toBe('3.1.0')
    expect(Object.keys(doc.paths).sort()).toEqual([
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
    return { res, body: res.status === 200 ? await res.json() : null }
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
    expect(schema.properties.where.properties.name.properties.eq.maxItems).toBe(100)
    expect(schema.properties.where.properties.name.properties.eq.minItems).toBe(1)
    expect(schema.properties.fiscal_year.properties.min.minimum).toBe(1)
    expect(schema.properties.fiscal_year.properties.max.maximum).toBe(9999)
    expect(tools.search_expenditure_nodes.description).toContain('"settlement"')
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
