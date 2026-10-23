import { BINARY_ASSETS } from './assets'
import { CHAT_SHELL_HTML } from './chat-shell'
import { MINCHO_WOFF2 } from './font.generated'
import { FAVICON_SVG, LANDING_HTML } from './landing'
import { Hono } from 'hono'
import { MANIFEST, OFFLINE_HTML, OFFLINE_PATH_NAME, SERVICE_WORKER } from './pwa'
import { api, type AppEnv } from './server/api'
import type { Env } from './server/env'
import { jurisdictions } from './server/jurisdiction-routes'

// 入口の1枚と、検索エンジン・ブラウザが取りに来る小さなファイル、会話の画面（/s/:id）と その API（/api/*）を配る。
// データの提供は api.fudoki.dev（Service Binding で繋ぐ）、文書は docs.fudoki.dev。会話の画面の JS・CSS は static/_app/ を assets で配る
const CACHE = 'public, max-age=300'
const ROBOTS = 'User-agent: *\nAllow: /\nDisallow: /s/\nDisallow: /api/\nSitemap: https://fudoki.dev/sitemap.xml\n'

const TEXT: Record<string, [string, string]> = {
  '/favicon.svg': ['image/svg+xml', FAVICON_SVG],
  '/robots.txt': ['text/plain; charset=utf-8', ROBOTS],
  '/manifest.webmanifest': ['application/manifest+json; charset=utf-8', MANIFEST],
}
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Cloudflare が公開している「常に通る」試験用の site key */
const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA'
const escapeAttr = (s: string) => s.replace(/[&"<>]/g, (c) => `&#${c.charCodeAt(0)};`)
const html = (body: string, cache: string) => new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cache } })

const app = new Hono<AppEnv>()

app.route('/', api)
// 自治体の個別ページ・一覧・内訳の API と、自治体の頁を含む sitemap
app.route('/', jurisdictions)

app.get('/', (c) => {
  const { hostname } = new URL(c.req.url)
  // Turnstile の site key は config の var（未設定なら入口の島は入力を出さない）。手元は本番の widget の hostname に無いので試験用の鍵（.dev.vars の試験用 secret と対）にする
  const siteKey = hostname === 'localhost' || hostname === '127.0.0.1' ? TURNSTILE_TEST_SITE_KEY : (c.env.TURNSTILE_SITE_KEY ?? '')
  return html(LANDING_HTML.replace('__TURNSTILE_SITE_KEY__', escapeAttr(siteKey)), CACHE)
})
app.get('/s/:id', (c, next) => (SESSION_ID.test(c.req.param('id')) ? html(CHAT_SHELL_HTML, 'no-store') : next()))
// service worker は更新を遅らせない（ブラウザは 24 時間まで古い sw.js を使うので no-cache にする）
app.get('/sw.js', () => new Response(SERVICE_WORKER, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' } }))
app.get(OFFLINE_PATH_NAME, () => html(OFFLINE_HTML, CACHE))
for (const [path, [type, body]] of Object.entries(TEXT)) app.get(path, () => new Response(body, { headers: { 'Content-Type': type, 'Cache-Control': CACHE } }))
for (const [path, { type, base64 }] of Object.entries({ '/fonts/mincho.woff2': { type: 'font/woff2', base64: MINCHO_WOFF2 }, ...BINARY_ASSETS }))
  app.get(path, () => new Response(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)), { headers: { 'Content-Type': type, 'Cache-Control': CACHE } }))
app.all('*', (c) =>
  c.req.method === 'GET' || c.req.method === 'HEAD'
    ? new Response('Not Found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': CACHE } })
    : new Response('Method Not Allowed\n', { status: 405, headers: { Allow: 'GET, HEAD' } }),
)

export default {
  fetch: (request: Request, env: Env = {}, ctx?: Parameters<typeof app.fetch>[2]) => app.fetch(request, env, ctx),
}
