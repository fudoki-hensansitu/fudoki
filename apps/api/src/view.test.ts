import { beforeEach, describe, expect, test } from 'bun:test'
import { createApp } from './app'
import type { Db } from './db'
import { testDb } from './testing'
import { VIEW_HTML, VIEW_URI } from './view.generated'
import { OUTPUT, render } from '../ui/build'

let db: Db
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
  ;({ db } = testDb())
})

describe('MCP Apps の View', () => {
  test('結果を表にする tool だけが _meta.ui.resourceUri（と旧キー）で View を指す', async () => {
    const tools = (await rpc('tools/list')).result.tools as { name: string; _meta?: Record<string, unknown> }[]
    const withView = tools.filter((t) => t._meta).map((t) => t.name).sort()
    expect(withView).toEqual(['get_expenditure_node', 'list_jurisdictions', 'search_expenditure_nodes'])
    for (const t of tools.filter((t) => t._meta)) expect(t._meta).toEqual({ ui: { resourceUri: VIEW_URI }, 'ui/resourceUri': VIEW_URI })
  })

  test('resources/read で View の HTML を MCP Apps の MIME type で返す', async () => {
    const listed = (await rpc('resources/list')).result.resources
    expect(listed).toEqual([expect.objectContaining({ uri: VIEW_URI, mimeType: 'text/html;profile=mcp-app' })])
    const read = (await rpc('resources/read', { uri: VIEW_URI })).result
    expect(read.contents).toEqual([{ uri: VIEW_URI, mimeType: 'text/html;profile=mcp-app', text: VIEW_HTML, _meta: { ui: { prefersBorder: true } } }])
  })

  test('resource の一覧は変わらないので listChanged を名乗らない', async () => {
    const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } })
    expect(init.result.capabilities.resources).toEqual({ listChanged: false })
    expect(init.result.capabilities.tools).toEqual({ listChanged: false })
  })

  test('View は外部の script・通信を持たず、URI は中身ごとに変わる', () => {
    expect(VIEW_URI).toMatch(/^ui:\/\/fudoki\/view-[0-9a-f]{12}\.html$/)
    expect(VIEW_HTML).not.toMatch(/<script[^>]+src=/i)
    expect(VIEW_HTML).not.toMatch(/<link[^>]+href=/i)
  })

  test('view.generated.ts は ui/ から作り直したものと同じ（bun ui/build.ts で書き直す）', async () => {
    expect(await Bun.file(OUTPUT).text()).toBe(await render())
  })
})
