import { beforeEach, describe, expect, test } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { createApp } from './app'
import type { Db } from './db'
import { insertNode, insertOrigin, testDb } from './testing'

let db: Db
let sqlite: Database
const app = createApp()

const get = (path: string) => app.request(path, {}, { DB: db })
const q = (params: Record<string, string>) => '?' + new URLSearchParams(params).toString()
const SCOPE = 'document_kind = "settlement" AND fiscal_year = 2024'

beforeEach(() => {
  ;({ db, sqlite } = testDb())
  insertOrigin(sqlite, { origin_id: 'o1', title: '決算書', url: 'https://example.test/o1', sha256: 'aaa' })
  insertOrigin(sqlite, { origin_id: 'o2', title: '決算書2', url: 'https://example.test/o2', sha256: 'bbb' })
  insertNode(sqlite, { document_kind: 'settlement', node_id: 'k1', node_kind: '款', axis: '科目', name: '総務費', amount_yen: 900, is_leaf: 0, is_subject: 1, origin_id: 'o1' })
  insertNode(sqlite, { document_kind: 'settlement', node_id: 'm1', parent_node_id: 'k1', node_kind: '目', axis: '科目', name: '庁舎管理費', amount_yen: 500, is_leaf: 1, cofog_code: '01.3', origin_id: 'o1' })
  insertNode(sqlite, { document_kind: 'settlement', node_id: 'm2', parent_node_id: 'k1', node_kind: '目', axis: '科目', name: '広報費', amount_yen: 400, is_leaf: 1, cofog_code: '01.3', origin_id: 'o1' })
  insertNode(sqlite, { document_kind: 'settlement', node_id: 's1', parent_node_id: 'k1', node_kind: '節', axis: '節', name: '委託料', amount_yen: 900, is_leaf: 1, origin_id: 'o2' })
  insertNode(sqlite, { document_kind: 'initial', node_id: 'k1', node_kind: '款', axis: '科目', name: '総務費', amount_yen: 950, origin_id: 'o1' })
  insertNode(sqlite, { document_kind: 'settlement', node_id: 'old', fiscal_year: 2019, node_kind: '目', name: '古い', amount_yen: 1 })
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
  })

  test('control が読めないときも止める', async () => {
    sqlite.query('DROP TABLE control').run()
    expect((await get('/')).status).toBe(503)
  })
})

describe('表の選択', () => {
  test('document_kind で表を選び、行には document_kind が付く', async () => {
    const body = await (await get('/v1/expenditure/nodes' + q({ filter: 'document_kind = "initial" AND fiscal_year = 2024' }))).json()
    expect(body.nodes).toHaveLength(1)
    expect(body.nodes[0].document_kind).toBe('initial')
    expect(Object.keys(body.nodes[0])[0]).toBe('document_kind')
  })

  test('document_kind は表の列ではないので最上位の一項以外では使えない', async () => {
    for (const extra of ['document_kind != "initial"', 'NOT document_kind = "initial"', '(document_kind = "initial" OR name = "x")']) {
      const res = await get('/v1/expenditure/nodes' + q({ filter: `${SCOPE} AND ${extra}` }))
      expect(res.status).toBe(400)
    }
    expect((await get('/v1/expenditure/nodes' + q({ filter: SCOPE, order_by: 'document_kind' }))).status).toBe(400)
  })
})

describe('GET /', () => {
  test('REST と MCP の URL を返す', async () => {
    const body = await (await get('http://x.test/')).json()
    expect(body.mcp).toBe('http://x.test/mcp')
    expect(body.rest).toBe('http://x.test/v1/expenditure/nodes')
  })
})

describe('list', () => {
  test('絞り込み・boolean の復元・origins は一度ずつ', async () => {
    const res = await get('/v1/expenditure/nodes' + q({ filter: `${SCOPE} AND node_kind = "目"`, order_by: 'amount_yen desc' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.nodes.map((n: { node_id: string }) => n.node_id)).toEqual(['m1', 'm2'])
    expect(body.nodes[0].is_leaf).toBe(true)
    expect(body.nodes[0].parent_node_id).toBe('k1')
    expect(body.nodes[0].cofog_status).toBeNull()
    expect(body.next_page_token).toBeNull()
    expect(body.origins).toHaveLength(1)
    expect(body.origins[0].origin_id).toBe('o1')
  })

  test('資料区分と年度で絞られる', async () => {
    const body = await (await get('/v1/expenditure/nodes' + q({ filter: 'document_kind = "initial" AND fiscal_year = 2024' }))).json()
    expect(body.nodes.map((n: { amount_yen: number }) => n.amount_yen)).toEqual([950])
    const old = await (await get('/v1/expenditure/nodes' + q({ filter: 'document_kind = "settlement" AND fiscal_year >= 2019 AND fiscal_year <= 2020' }))).json()
    expect(old.nodes.map((n: { node_id: string }) => n.node_id)).toEqual(['old'])
  })

  test('GLOB の前方一致', async () => {
    const body = await (await get('/v1/expenditure/nodes' + q({ filter: `${SCOPE} AND cofog_code = "01.*"` }))).json()
    expect(body.nodes).toHaveLength(2)
  })

  test('ページングは order_by の末尾に node_id を足して順序を決める', async () => {
    const f = `${SCOPE} AND amount_yen > 0`
    const page1 = await (await get('/v1/expenditure/nodes' + q({ filter: f, order_by: 'axis', page_size: '2' }))).json()
    expect(page1.nodes).toHaveLength(2)
    expect(page1.next_page_token).toBeString()
    const page2 = await (await get('/v1/expenditure/nodes' + q({ filter: f, order_by: 'axis', page_size: '2', page_token: page1.next_page_token }))).json()
    expect(page2.next_page_token).toBeNull()
    const ids = [...page1.nodes, ...page2.nodes].map((n: { node_id: string }) => n.node_id)
    expect(ids).toEqual(['k1', 'm1', 'm2', 's1']) // axis 科目 → 節、同じ軸は node_id 順
  })

  test('order_by の方向は大文字小文字を問わない', async () => {
    for (const dir of ['desc', 'DESC', 'Desc']) {
      const body = await (await get('/v1/expenditure/nodes' + q({ filter: `${SCOPE} AND node_kind = "目"`, order_by: `amount_yen ${dir}` }))).json()
      expect(body.nodes.map((n: { node_id: string }) => n.node_id)).toEqual(['m1', 'm2'])
    }
    expect((await get('/v1/expenditure/nodes' + q({ filter: SCOPE, order_by: 'amount_yen up' }))).status).toBe(400)
  })

  test('文字列の途中の * は 400', async () => {
    const res = await get('/v1/expenditure/nodes' + q({ filter: `${SCOPE} AND name = "庁*管理費"` }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toContain('先頭か末尾')
  })

  test('別の問い合わせの page_token は 400', async () => {
    const page1 = await (await get('/v1/expenditure/nodes' + q({ filter: SCOPE, page_size: '1' }))).json()
    const res = await get('/v1/expenditure/nodes' + q({ filter: `${SCOPE} AND amount_yen > 0`, page_size: '1', page_token: page1.next_page_token }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('INVALID_ARGUMENT')
    expect((await get('/v1/expenditure/nodes' + q({ filter: SCOPE, page_token: '!!' }))).status).toBe(400)
  })

  test('page_size は上限に丸め、負数は 400', async () => {
    expect((await get('/v1/expenditure/nodes' + q({ filter: SCOPE, page_size: '100000' }))).status).toBe(200)
    expect((await get('/v1/expenditure/nodes' + q({ filter: SCOPE, page_size: '-1' }))).status).toBe(400)
  })

  test.each([
    ['filter なし', {}],
    ['資料区分なし', { filter: 'fiscal_year = 2024' }],
    ['補正予算', { filter: 'document_kind = "supplementary" AND fiscal_year = 2024' }],
    ['年度なし', { filter: 'document_kind = "settlement"' }],
    ['未許可の列', { filter: `${SCOPE} AND row_hash = "h"` }],
    ['未許可の order_by', { filter: SCOPE, order_by: 'row_hash' }],
    ['order_by の構文', { filter: SCOPE, order_by: 'name; DROP TABLE control' }],
  ])('%s は 400 と {error: {code, message}}', async (_, params) => {
    const res = await get('/v1/expenditure/nodes' + q(params))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('INVALID_ARGUMENT')
    expect(body.error.message).toBeString()
  })

  test('SQL インジェクションの値は bind される', async () => {
    const body = await (await get('/v1/expenditure/nodes' + q({ filter: `${SCOPE} AND name = "x\\" OR 1=1 --"` }))).json()
    expect(body.nodes).toEqual([])
    expect(sqlite.query('SELECT count(*) AS n FROM control').get()).toEqual({ n: 1 })
  })
})

describe('get', () => {
  test('ノードと軸ごとの子', async () => {
    const res = await get('/v1/expenditure/nodes/settlement/k1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.node.node_id).toBe('k1')
    expect(Object.keys(body.children).sort()).toEqual(['科目', '節'])
    expect(body.children['科目'].map((n: { node_id: string }) => n.node_id)).toEqual(['m1', 'm2'])
    expect(body.next_page_token).toBeNull()
    expect(body.origins.map((o: { origin_id: string }) => o.origin_id)).toEqual(['o1', 'o2'])
  })

  test('子のページング', async () => {
    const p1 = await (await get('/v1/expenditure/nodes/settlement/k1?page_size=2')).json()
    expect(p1.next_page_token).toBeString()
    const p2 = await (await get('/v1/expenditure/nodes/settlement/k1' + q({ page_size: '2', page_token: p1.next_page_token }))).json()
    expect(Object.values(p2.children).flat()).toHaveLength(1)
    expect((await get('/v1/expenditure/nodes/initial/k1' + q({ page_token: p1.next_page_token }))).status).toBe(400)
  })

  test('資料区分が違えば別のノード、無ければ 404、補正は 400', async () => {
    expect((await (await get('/v1/expenditure/nodes/initial/k1')).json()).node.amount_yen).toBe(950)
    const missing = await get('/v1/expenditure/nodes/settlement/none')
    expect(missing.status).toBe(404)
    expect((await missing.json()).error.code).toBe('NOT_FOUND')
    expect((await get('/v1/expenditure/nodes/supplementary/k1')).status).toBe(400)
  })
})

describe('columns と OpenAPI', () => {
  test('列の説明に和の条件と必須条件が添えられる', async () => {
    const body = await (await get('/v1/expenditure/columns')).json()
    expect(body.columns.length).toBeGreaterThan(20)
    expect(body.columns[0].name).toBe('document_kind')
    expect(body.filter_columns).toContain('cofog_code')
    expect(body.sum_rules.length).toBe(5)
    expect(body.required_filter).toContain('document_kind')
  })

  test('nullable が false の列は OpenAPI の応答で非 null', async () => {
    const doc = await (await get('/openapi.json')).json()
    const node = doc.paths['/v1/expenditure/nodes'].get.responses['200'].content['application/json'].schema.properties.nodes.items
    expect(node.properties.node_id.type).toBe('string')
    expect(JSON.stringify(node.properties.node_kind)).not.toContain('null')
    expect(JSON.stringify(node.properties.cofog_code)).toContain('null')
  })

  test('/openapi.json は 3.1', async () => {
    const doc = await (await get('/openapi.json')).json()
    expect(doc.openapi).toBe('3.1.0')
    expect(Object.keys(doc.paths).sort()).toEqual([
      '/v1/expenditure/columns',
      '/v1/expenditure/nodes',
      '/v1/expenditure/nodes/{document_kind}/{node_id}',
    ])
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

  test('initialize → tools/list → tools/call', async () => {
    const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } })
    expect(init.body.result.serverInfo.name).toBe('fudoki-api')
    const list = await rpc('tools/list')
    expect(list.body.result.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      'describe_expenditure_columns',
      'get_expenditure_node',
      'list_expenditure_nodes',
    ])
    const call = await rpc('tools/call', { name: 'list_expenditure_nodes', arguments: { filter: `${SCOPE} AND node_kind = "目"`, page_size: 1 } })
    const out = JSON.parse(call.body.result.content[0].text)
    expect(out.nodes).toHaveLength(1)
    expect(out.next_page_token).toBeString()
    expect(call.body.result.isError).toBeUndefined()
  })

  test('操作のエラーは isError の tool 結果', async () => {
    const call = await rpc('tools/call', { name: 'list_expenditure_nodes', arguments: { filter: 'fiscal_year = 2024' } })
    expect(call.body.result.isError).toBe(true)
    expect(JSON.parse(call.body.result.content[0].text).error.code).toBe('INVALID_ARGUMENT')
    const get404 = await rpc('tools/call', { name: 'get_expenditure_node', arguments: { document_kind: 'settlement', node_id: 'none' } })
    expect(JSON.parse(get404.body.result.content[0].text).error.code).toBe('NOT_FOUND')
  })

  test('tool の入力 schema に page_size の ±9e15 が出ず、page_token の説明が tool ごとに正しい', async () => {
    const { body } = await rpc('tools/list')
    const tools = Object.fromEntries(body.result.tools.map((t: { name: string }) => [t.name, t]))
    const size = tools.list_expenditure_nodes.inputSchema.properties.page_size
    expect(JSON.stringify(size)).not.toContain('9007199254740991')
    expect(size.minimum).toBe(0)
    expect(size.description).toContain('丸める')
    expect(tools.list_expenditure_nodes.inputSchema.properties.page_token.description).toContain('filter')
    const get = tools.get_expenditure_node.inputSchema.properties.page_token.description
    expect(get).not.toContain('filter')
    expect(get).toContain('node_id')
  })

  test('POST 以外は 405', async () => {
    expect((await get('/mcp')).status).toBe(405)
  })
})
