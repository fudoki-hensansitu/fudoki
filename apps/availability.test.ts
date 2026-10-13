import { expect, test } from 'bun:test'
import web from './web/worker'

for (const [name, worker] of Object.entries({ web })) {
  test(`${name} returns an uncached server error without service bindings`, async () => {
    const response = worker.fetch()
    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.text()).toBe('Temporarily unavailable\n')
  })
}
