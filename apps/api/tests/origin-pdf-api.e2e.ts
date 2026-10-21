import { test, beforeEach } from 'e2e'
import { expect } from 'e2e'

beforeEach(async ({ app }) => { await fetch(new URL('/__reset', app.baseUrl!), { method: 'POST' }) })
const get = (baseUrl: string, id: string) => fetch(new URL(`/v1/origins/${id.split('?')[0]}/pdf${id.includes('?') ? '?' + id.split('?')[1] : ''}`, baseUrl))
const advance = (baseUrl: string, ms: number) => fetch(new URL('/__advance', baseUrl), { method: 'POST', body: String(ms) })
const hits = async (baseUrl: string) => (await fetch(new URL('/__stats', baseUrl))).json()

test('出典IDから中継・同時要求と同URL別IDを24h再利用・期限後は再取得', async ({ app }) => {
  const responses = await Promise.all(Array.from({ length: 4 }, (_, i) => get(app.baseUrl!, i === 3 ? 'same' : 'ok')))
  for (const r of responses) {
    expect(r.status).toBe(200)
    expect(r.headers.get('access-control-allow-origin')).toBe('*')
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(decodeURIComponent(r.headers.get('x-origin-url')!)).toBe('https://city.fudoki.dev/ok.pdf')
    expect(await r.text()).toMatch(/^%PDF-/)
  }
  expect((await hits(app.baseUrl!))['/ok.pdf']).toBe(1)
  const firstTime = responses[0]!.headers.get('x-origin-fetched-at')
  await advance(app.baseUrl!, 24 * 60 * 60 * 1000 - 10_000)
  expect((await get(app.baseUrl!, 'ok')).headers.get('x-origin-fetched-at')).toBe(firstTime)
  await advance(app.baseUrl!, 24 * 60 * 60 * 1000 + 1000)
  const refreshed = await get(app.baseUrl!, 'ok')
  expect(refreshed.status).toBe(200)
  expect(refreshed.headers.get('x-origin-fetched-at')).not.toBe(firstTime)
  expect((await hits(app.baseUrl!))['/ok.pdf']).toBe(2)
})

test('任意URL/query・CSV・内部URL・未知ID・POSTを拒否', async ({ app }) => {
  for (const [id, status] of [['ok?url=https://attacker.com/private', 400], [encodeURIComponent('https://attacker.com/a.pdf'), 404], ['csv', 400], ['private', 400], ['unknown', 404]] as const) {
    const r = await get(app.baseUrl!, id)
    expect(r.status).toBe(status)
    expect(r.headers.get('access-control-allow-origin')).toBe('*')
  }
  expect((await fetch(new URL('/v1/origins/ok/pdf', app.baseUrl!), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(405)
  expect(await hits(app.baseUrl!)).toEqual({})
})

test('404/redirect/非PDF/偽PDFを成功保存せず、失敗URLは1分後に再取得', async ({ app }) => {
  for (const id of ['missing', 'redirect', 'html', 'fake', 'recover']) {
    expect((await get(app.baseUrl!, id)).status).toBe(502)
    expect((await get(app.baseUrl!, id)).status).toBe(429)
  }
  expect((await hits(app.baseUrl!))['/private.pdf']).toBeUndefined()
  await advance(app.baseUrl!, 61_000)
  expect((await get(app.baseUrl!, 'recover')).status).toBe(200)
  expect((await hits(app.baseUrl!))['/recover.pdf']).toBe(2)
})

test('Content-Lengthと実読取32MiBの両方を制限', async ({ app }) => {
  for (const id of ['big-header', 'big-stream']) {
    const r = await get(app.baseUrl!, id)
    expect(r.status).toBe(502)
    expect((await r.json()).error.message).toContain('32 MiB')
    expect((await get(app.baseUrl!, id)).status).toBe(429)
  }
})

test('本文を待ち続けず20秒で失敗', async ({ app }) => {
  const start = performance.now()
  const r = await get(app.baseUrl!, 'slow')
  expect(r.status).toBe(504)
  expect(performance.now() - start).toBeLessThan(23_000)
  expect((await r.json()).error.message).toContain('20秒')
})

test('取得6回/分・閲覧120回/分、キャッシュ命中も閲覧上限を適用', async ({ app }) => {
  for (let i = 0; i < 6; i++) expect((await get(app.baseUrl!, `extra-${i}`)).status).toBe(200)
  expect((await get(app.baseUrl!, 'extra-6')).status).toBe(429)
  for (let i = 7; i < 120; i++) expect((await get(app.baseUrl!, 'extra-0')).status).toBe(200)
  expect((await get(app.baseUrl!, 'extra-0')).status).toBe(429)
  expect((await hits(app.baseUrl!))['/extra-6.pdf']).toBeUndefined()
})

test('保持16URLに達したら有効なPDFを追い出さず新規を拒否、24h後は空く', async ({ app }) => {
  for (let i = 0; i < 16; i++) {
    if (i === 6 || i === 12) await advance(app.baseUrl!, Math.ceil(i / 6) * 61_000)
    expect((await get(app.baseUrl!, `extra-${i}`)).status).toBe(200)
  }
  expect((await get(app.baseUrl!, 'extra-16')).status).toBe(429)
  expect((await get(app.baseUrl!, 'extra-0')).status).toBe(200)
  expect((await hits(app.baseUrl!))['/extra-0.pdf']).toBe(1)
  await advance(app.baseUrl!, 24 * 60 * 60 * 1000 + 180_000)
  expect((await get(app.baseUrl!, 'extra-16')).status).toBe(200)
})

// 上限での成功も検証し、分割保存・再利用の境界を確かめる。
test('32MiBちょうどを中継・保持・再利用できる', async ({ app }) => {
  for (let i = 0; i < 2; i++) {
    const r = await get(app.baseUrl!, 'limit')
    expect(r.status).toBe(200)
    expect((await r.arrayBuffer()).byteLength).toBe(32 * 1024 * 1024)
  }
  expect((await hits(app.baseUrl!))['/limit.pdf']).toBe(1)
})

test('headersと本文先頭を受信後に止まっても20秒で失敗', async ({ app }) => {
  const start = performance.now()
  const r = await get(app.baseUrl!, 'slow-body')
  expect(r.status).toBe(504)
  expect(performance.now() - start).toBeLessThan(23_000)
  expect(r.headers.get('access-control-allow-origin')).toBe('*')
})
