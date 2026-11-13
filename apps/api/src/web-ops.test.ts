import { expect, test } from 'bun:test'
import { createApp, tools, webMcp } from './app'
import { insertJurisdiction, testDb } from './testing'
import { callWebOp, WEB_OPS } from './web-ops'

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
  expect(Object.keys(WEB_OPS).sort()).toEqual([...tools.map((t) => t.name), 'get_jurisdiction'].sort())
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
  const res = await webMcp(env, new Request('https://api.fudoki.dev/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))
  expect(res.status).toBe(503)
})

test('アシスタントの MCP は公開の /mcp と同じ tool の一覧を返す', async () => {
  const { env } = setup()
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
  const init = { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' }, body }
  const names = async (res: Response) => ((await rpcBody(res)) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name)
  const internal = await webMcp(env, new Request('https://api.fudoki.dev/mcp', init))
  expect(internal.status).toBe(200)
  const pub = await createApp().fetch(new Request('https://api.fudoki.dev/mcp', init), env)
  expect(await names(internal)).toEqual(await names(pub))
  expect((await webMcp(env, new Request('https://api.fudoki.dev/mcp'))).status).toBe(405)
})
