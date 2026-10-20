// Service Binding 越しに apps/api の MCP を呼ぶ fetch の試験。ここが壊れるとチャットが丸ごと止まる
import { expect, test } from 'bun:test'
import { apiFetch, MCP_URL } from './env'

test("redirect: 'error' で呼ばれても Service Binding には 'manual' で渡す（Workers は 'error' を受け付けない）", async () => {
  let seen: Request | undefined
  const API = { fetch: async (req: Request) => ((seen = req), new Response('ok')) }
  await apiFetch({ API })(MCP_URL, { method: 'POST', redirect: 'error' })
  expect(seen?.url).toBe(MCP_URL)
  expect(seen?.redirect).toBe('manual')
})
