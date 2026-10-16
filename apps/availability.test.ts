import { expect, test } from 'bun:test'
import web from './web/worker'

test('web は / で入口の1枚を返し、他のパスは 404', async () => {
  const top = web.fetch(new Request('https://fudoki.dev/'))
  expect(top.status).toBe(200)
  expect(top.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
  const html = await top.text()
  expect(html).toContain('https://api.fudoki.dev/mcp')
  expect(html).toContain('https://docs.fudoki.dev/privacy')
  expect(web.fetch(new Request('https://fudoki.dev/favicon.svg')).status).toBe(200)
  expect(web.fetch(new Request('https://fudoki.dev/nope')).status).toBe(404)
  expect(web.fetch(new Request('https://fudoki.dev/', { method: 'POST' })).status).toBe(405)
})
