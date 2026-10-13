import { expect, test } from 'bun:test'
import worker from './worker'

test('docs worker hands every request to the static assets', async () => {
  const seen: string[] = []
  const env = {
    ASSETS: {
      async fetch(request: Request) {
        seen.push(request.url)
        return new Response('asset', { status: 404 })
      },
    },
  }
  const response = await worker.fetch(new Request('https://docs.fudoki.dev/nope'), env)
  expect(seen).toEqual(['https://docs.fudoki.dev/nope'])
  expect(response.status).toBe(404)
})
