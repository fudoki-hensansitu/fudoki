import { beforeEach, describe, expect, test } from 'bun:test'
import { createApp, RENDER_RESULT_TEXT } from './app'
import type { Db } from './db'
import type { Database } from 'bun:sqlite'
import { insertJurisdiction, insertNode, testDb } from './testing'
import { VIEW_HTML, VIEW_URI } from './view.generated'
import { OUTPUT, render } from '../ui/build'
import { SUGGESTIONS_META_KEY } from '../../../packages/fiscal/suggestions'

let db: Db
let sqlite: Database
const app = createApp()

const rpc = async (method: string, params: unknown = {}) => {
  const res = await app.request(
    '/mcp',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    },
    { DB: db }
  )
  const text = await res.text()
  const data = /^data: (.*)$/m.exec(text)
  return JSON.parse(data ? data[1]! : text)
}

beforeEach(() => {
  ;({ db, sqlite } = testDb())
})

describe('MCP Apps の View', () => {
  test('View を指すのは描画 tool だけで、データ tool は _meta.ui を持たない', async () => {
    const tools = (await rpc('tools/list')).result.tools as { name: string; _meta?: Record<string, unknown> }[]
    const withView = tools.filter((t) => t._meta).map((t) => t.name)
    expect(withView).toEqual(['render_expenditure_view'])
    expect(tools.find((t) => t.name === 'render_expenditure_view')!._meta).toEqual({ ui: { resourceUri: VIEW_URI }, 'ui/resourceUri': VIEW_URI })
    for (const name of ['get_expenditure_node', 'list_jurisdictions', 'search_expenditure_nodes']) expect(tools.some((t) => t.name === name)).toBe(true)
  })

  test('どの tool も title を最上位と annotations の両方に持ち、読み取り専用と宣言する（Claude の提出画面の検査）', async () => {
    const tools = (await rpc('tools/list')).result.tools as { name: string; title?: string; annotations?: { title?: string; readOnlyHint?: boolean } }[]
    expect(tools.length).toBeGreaterThan(0)
    for (const t of tools) {
      expect(t.title, t.name).toBeTruthy()
      expect(t.annotations?.title, t.name).toBe(t.title)
      expect(t.annotations?.readOnlyHint, t.name).toBe(true)
    }
  })

  test('描画 tool はデータ tool と同じ結果を返し、入力が不正なら isError', async () => {
    insertJurisdiction(sqlite, { jurisdiction_code: '132039', name: '武蔵野市' })
    insertNode(sqlite, { document_kind: 'settlement', node_id: 'n1', name: '総務費', node_kind: '款', amount_yen: 100 })
    const args = { document_kind: 'settlement', fiscal_year: { min: 2024, max: 2024 } }
    const direct = (await rpc('tools/call', { name: 'search_expenditure_nodes', arguments: args })).result
    const rendered = (await rpc('tools/call', { name: 'render_expenditure_view', arguments: { tool: 'search_expenditure_nodes', arguments: args } })).result
    expect(rendered.structuredContent).toEqual(direct.structuredContent)
    // データは structuredContent だけで返し、text に同じ内容を写さない（会話の文脈を膨らませないため）
    expect(rendered.content).toEqual([{ type: 'text', text: RENDER_RESULT_TEXT }])
    expect(rendered._meta).toEqual(direct._meta)
    const bad = (await rpc('tools/call', { name: 'render_expenditure_view', arguments: { tool: 'get_expenditure_node', arguments: {} } })).result
    expect(bad.isError).toBe(true)
    // 団体の一覧は View を持たず、描画 tool では呼べない
    const noView = (await rpc('tools/call', { name: 'render_expenditure_view', arguments: { tool: 'list_jurisdictions', arguments: {} } })).result
    expect(noView.isError).toBe(true)
  })

  test('描画 tool は、結果の団体コードに対応する団体名を _meta にだけ載せる', async () => {
    insertJurisdiction(sqlite, { jurisdiction_code: '132039', name: '武蔵野市' })
    insertNode(sqlite, { document_kind: 'settlement', node_id: 'n1', name: '総務費', node_kind: '款', amount_yen: 100 })
    const res = (await rpc('tools/call', { name: 'render_expenditure_view', arguments: { tool: 'search_expenditure_nodes', arguments: { document_kind: 'settlement', fiscal_year: { min: 2024, max: 2024 } } } })).result
    expect(res._meta.jurisdictionNames).toEqual({ '132039': '武蔵野市' })
    expect(JSON.stringify(res.structuredContent)).not.toContain('武蔵野市')
  })

  test('結果の _meta に次の質問の候補を載せ、text と structuredContent には載せない', async () => {
    insertJurisdiction(sqlite, { jurisdiction_code: '132039', name: '武蔵野市' })
    insertNode(sqlite, { document_kind: 'settlement', node_id: 'n1', name: '総務費', node_kind: '款', amount_yen: 100, is_leaf: 0 })
    insertNode(sqlite, { document_kind: 'settlement', node_id: 'n2', name: '民生費', node_kind: '款', amount_yen: 900, is_leaf: 0 })
    const args = { document_kind: 'settlement', fiscal_year: { min: 2024, max: 2024 } }
    const res = (await rpc('tools/call', { name: 'search_expenditure_nodes', arguments: args })).result
    expect(res._meta[SUGGESTIONS_META_KEY]).toEqual([
      { label: '「民生費」の内訳を見る', prompt: '武蔵野市の2024年度決算（一般会計）の「民生費」の内訳を見せて' },
      { label: '「民生費」を他の年度と比べる', prompt: '武蔵野市の2024年度決算（一般会計）の「民生費」を他の年度と比べて' },
      { label: '「民生費」を他の自治体と比べる', prompt: '武蔵野市の2024年度決算（一般会計）の「民生費」を他の自治体と比べて' },
    ])
    expect(JSON.stringify(res.structuredContent)).not.toContain('の内訳を見る')
    expect(res.content[0].text).not.toContain('の内訳を見る')
    const list = (await rpc('tools/call', { name: 'list_jurisdictions', arguments: {} })).result
    expect(list._meta[SUGGESTIONS_META_KEY]).toBeUndefined()
  })

  test('resources/read で View の HTML を MCP Apps の MIME type で返す', async () => {
    const listed = (await rpc('resources/list')).result.resources
    expect(listed).toEqual([expect.objectContaining({ uri: VIEW_URI, mimeType: 'text/html;profile=mcp-app' })])
    const read = (await rpc('resources/read', { uri: VIEW_URI })).result
    expect(read.contents).toEqual([{ uri: VIEW_URI, mimeType: 'text/html;profile=mcp-app', text: VIEW_HTML, _meta: { ui: { prefersBorder: true, csp: { connectDomains: ['http://localhost'] } } } }])
  })

  test('View は外部の script を持たず、URI は中身ごとに変わる', () => {
    expect(VIEW_URI).toMatch(/^ui:\/\/fudoki\/view-[0-9a-f]{12}\.html$/)
    expect(VIEW_HTML).not.toMatch(/<script[^>]+src=/i)
    expect(VIEW_HTML).not.toMatch(/<link[^>]+href=/i)
  })

  test('view.generated.ts は ui/ から作り直したものと同じ（bun ui/build.ts で書き直す）', async () => {
    expect(await Bun.file(OUTPUT).text()).toBe(await render())
  })
})
