// web が apps/api を呼ぶ口の試験。ここが壊れると自治体の頁もチャットも丸ごと止まる
import { expect, test } from 'bun:test'
import { apiCall, FudokiApiError, type WebRpc } from './fudoki-api'

const rpc = (patch: Partial<WebRpc>): WebRpc => ({ call: async () => ({ ok: true, value: {} as never }), tools: async () => [], runTool: async () => ({ ok: true, value: { value: {}, suggestions: [] } }), ...patch })

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
