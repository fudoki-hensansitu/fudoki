import { expect, test } from 'bun:test'
import { createApp, tools } from './app'
import { insertJurisdiction, testDb } from './testing'
import { assistantTools, callAssistantTool, callWebOp, WEB_OPS } from './web-ops'

/** MCP の応答の body（SSE か JSON） */
const rpcBody = async (res: Response) => {
  const text = await res.text()
  const data = /^data: (.*)$/m.exec(text)
  return JSON.parse(data ? data[1]! : text)
}

const setup = () => {
  const { db, sqlite } = testDb()
  insertJurisdiction(sqlite, { jurisdiction_code: '131091', name: '品川区' })
  return { env: { DB: db }, sqlite }
}

test('web の内部の口は、公開の MCP と同じ tool と get_jurisdiction を同じ入力で呼ぶ', async () => {
  const { env } = setup()
  expect(Object.keys(WEB_OPS).sort()).toEqual([...tools.map((t) => t.name), 'get_jurisdiction', 'list_expenditures', 'count_evaluation_sheets'].sort())
  const list = await callWebOp(env, 'list_jurisdictions', { name: '品川' })
  expect(list.ok && (list.value as { jurisdictions: { name: string }[] }).jurisdictions.map((j) => j.name)).toEqual(['品川区'])
  const one = await callWebOp(env, 'get_jurisdiction', { jurisdiction_code: '131091' })
  expect(one.ok && (one.value as { name: string }).name).toBe('品川区')
})

test('無い操作・形の違う入力・収録の無い自治体は投げずに公開の REST と同じ status で返す', async () => {
  const { env } = setup()
  expect(await callWebOp(env, 'drop_tables', {})).toMatchObject({ ok: false, status: 404 })
  expect(await callWebOp(env, '__proto__', {})).toMatchObject({ ok: false, status: 404 })
  expect(await callWebOp(env, 'list_jurisdictions', { unknown: 1 })).toMatchObject({ ok: false, status: 400, code: 'INVALID_ARGUMENT' })
  expect(await callWebOp(env, 'get_jurisdiction', { jurisdiction_code: '131016' })).toMatchObject({ ok: false, status: 404, code: 'NOT_FOUND' })
})

test('kill switch が off なら内部の口も止める', async () => {
  const { env, sqlite } = setup()
  sqlite.query(`UPDATE control SET value = 'off' WHERE key = 'serving'`).run()
  expect(await callWebOp(env, 'list_jurisdictions', {})).toMatchObject({ ok: false, status: 503 })
  expect(await callAssistantTool(env, 'list_jurisdictions', {})).toMatchObject({ ok: false, status: 503 })
})

test('アシスタントの tool は公開の /mcp の tool（描画 tool を除く）と同じ名前・説明に、web だけの操作を足したもの', async () => {
  const { env } = setup()
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
  const init = { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' }, body }
  const pub = ((await rpcBody(await createApp().fetch(new Request('https://api.fudoki.dev/mcp', init), env))) as { result: { tools: { name: string; description: string; inputSchema: unknown }[] } }).result.tools
  const defs = assistantTools()
  const byName = new Map(defs.map((d) => [d.name, d]))
  for (const t of pub.filter((t) => t.name !== 'render_expenditure_view')) expect(byName.get(t.name)).toMatchObject({ description: t.description, inputSchema: { type: 'object' } })
  expect(defs.map((d) => d.name)).toContain('count_evaluation_sheets')
  for (const d of defs) expect(Object.keys(WEB_OPS)).toContain(d.name)
})

test('アシスタントの tool は結果を返し、WEB_OPS に無い名前や tool にしていない操作は 404', async () => {
  const { env } = setup()
  const r = await callAssistantTool(env, 'list_jurisdictions', { name: '品川' })
  expect(r.ok && (r.value.value as { jurisdictions: { name: string }[] }).jurisdictions.map((j) => j.name)).toEqual(['品川区'])
  expect(await callAssistantTool(env, 'get_jurisdiction', { jurisdiction_code: '131091' })).toMatchObject({ ok: false, status: 404 })
  expect(await callAssistantTool(env, 'drop_tables', {})).toMatchObject({ ok: false, status: 404 })
  expect(await callAssistantTool(env, 'list_jurisdictions', { unknown: 1 })).toMatchObject({ ok: false, status: 400 })
})
