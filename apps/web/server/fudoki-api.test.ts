// web が apps/api を呼ぶ口の試験。ここが壊れると自治体の頁もチャットも丸ごと止まる
import { expect, test } from 'bun:test'
import { apiCall, FudokiApiError, MCP_URL, mcpFetch, type WebRpc } from './fudoki-api'

const rpc = (patch: Partial<WebRpc>): WebRpc => ({ call: async () => ({ ok: true, value: {} as never }), mcp: async () => new Response('ok'), ...patch })

test("MCP は内部の RPC の mcp に渡し、redirect: 'error' は 'manual' にする（Workers は 'error' を受け付けない）", async () => {
  let seen: Request | undefined
  const WEB = rpc({ mcp: async (req) => ((seen = req), new Response('ok')) })
  await mcpFetch({ WEB })(MCP_URL, { method: 'POST', redirect: 'error' })
  expect(seen?.url).toBe(MCP_URL)
  expect(seen?.redirect).toBe('manual')
})

test('操作は内部の RPC で呼び、失敗は status つきで投げる', async () => {
  const calls: unknown[] = []
  const WEB = rpc({
    call: async (name, input) => {
      calls.push([name, input])
      return name === 'get_jurisdiction' ? { ok: false, status: 404, code: 'NOT_FOUND', message: 'なし' } : { ok: true, value: { jurisdictions: [] } as never }
    },
  })
  expect(await apiCall({ WEB })('list_jurisdictions', {})).toEqual({ jurisdictions: [] } as never)
  const err = await apiCall({ WEB })('get_jurisdiction', { jurisdiction_code: '131148' }).catch((e) => e)
  expect(err).toBeInstanceOf(FudokiApiError)
  expect(err.status).toBe(404)
  expect(calls).toEqual([['list_jurisdictions', {}], ['get_jurisdiction', { jurisdiction_code: '131148' }]])
})
