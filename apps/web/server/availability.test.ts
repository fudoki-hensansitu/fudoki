import { expect, test } from 'bun:test'
import web from './web/worker'

const get = async (path: string, init?: RequestInit) => web.fetch(new Request(`https://fudoki.dev${path}`, init))

test('web は / で入口の1枚を返し、他のパスは 404', async () => {
  const top = await get('/')
  expect(top.status).toBe(200)
  expect(top.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
  const html = await top.text()
  expect(html).toContain('https://api.fudoki.dev/mcp')
  expect(html).toContain('https://docs.fudoki.dev/privacy')
  for (const path of ['/fonts/mincho.woff2', '/favicon.svg', '/favicon.ico', '/icon.png', '/apple-touch-icon.png', '/og.png', '/robots.txt', '/sitemap.xml']) expect((await get(path)).status, path).toBe(200)
  expect(html).toContain('https://fudoki.dev/og.png')
  expect((await get('/nope')).status).toBe(404)
  expect((await get('/', { method: 'POST' })).status).toBe(405)
})

test('入口の AI の入力は、Turnstile の site key が無ければ空の key で出す', async () => {
  const html = await (await get('/')).text()
  expect(html).toContain('id="chat-start"')
  expect(html).toContain('data-turnstile-sitekey=""')
  const keyed = await (await web.fetch(new Request('https://fudoki.dev/'), { TURNSTILE_SITE_KEY: '0x"<k>' })).text()
  expect(keyed).toContain('data-turnstile-sitekey="0x&#34;&#60;k&#62;"')
})

test('会話の画面は /s/<uuid> だけで返し、保存させない', async () => {
  const res = await get(`/s/${crypto.randomUUID()}`)
  expect(res.status).toBe(200)
  expect(res.headers.get('Cache-Control')).toBe('no-store')
  expect(await res.text()).toContain('id="chat-session"')
  expect((await get('/s/not-a-uuid')).status).toBe(404)
})

test('PWA: manifest・service worker・アイコン・オフラインの頁を返し、入口と会話の頁から繋ぐ', async () => {
  const manifest = await get('/manifest.webmanifest')
  expect(manifest.status).toBe(200)
  const json = (await manifest.json()) as { start_url: string; display: string; icons: { src: string; purpose: string }[] }
  expect(json.display).toBe('standalone')
  for (const icon of json.icons) expect((await get(icon.src)).status, icon.src).toBe(200)
  expect(json.icons.some((i) => i.purpose === 'maskable')).toBe(true)
  const sw = await get('/sw.js')
  expect(sw.status).toBe(200)
  expect(sw.headers.get('Cache-Control')).toBe('no-cache')
  expect((await get('/offline')).status).toBe(200)
  for (const path of ['/', `/s/${crypto.randomUUID()}`]) {
    const html = await (await get(path)).text()
    expect(html, path).toContain('rel="manifest"')
    expect(html, path).toContain("register('/sw.js')")
  }
})
