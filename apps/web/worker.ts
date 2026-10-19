import { BINARY_ASSETS } from './assets'
import { CHAT_SHELL_HTML } from './chat-shell'
import { MINCHO_WOFF2 } from './font.generated'
import { FAVICON_SVG, LANDING_HTML } from './landing'
import { handleApi, isApiPath } from './server/api'
import type { Ctx, Env } from './server/env'

// 入口の1枚と、検索エンジン・ブラウザが取りに来る小さなファイル、会話の画面（/s/:id）と その API（/api/*）を配る。
// データの提供は api.fudoki.dev（Service Binding で繋ぐ）、文書は docs.fudoki.dev。会話の画面の JS・CSS は static/_app/ を assets で配る
const CACHE = 'public, max-age=300'
const ROBOTS = 'User-agent: *\nAllow: /\nDisallow: /s/\nDisallow: /api/\nSitemap: https://fudoki.dev/sitemap.xml\n'
const SITEMAP = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://fudoki.dev/</loc></url></urlset>\n'

const TEXT: Record<string, [string, string]> = {
  '/favicon.svg': ['image/svg+xml', FAVICON_SVG],
  '/robots.txt': ['text/plain; charset=utf-8', ROBOTS],
  '/sitemap.xml': ['application/xml; charset=utf-8', SITEMAP],
}
const SESSION_PATH = /^\/s\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Cloudflare が公開している「常に通る」試験用の site key */
const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA'
const escapeAttr = (s: string) => s.replace(/[&"<>]/g, (c) => `&#${c.charCodeAt(0)};`)
const html = (body: string, cache: string) => new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cache } })

export default {
  fetch(request: Request, env: Env = {}, ctx: Ctx = { waitUntil: () => {} }): Response | Promise<Response> {
    const { pathname, hostname } = new URL(request.url)
    if (isApiPath(pathname)) return handleApi(request, env, ctx)
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed\n', { status: 405, headers: { Allow: 'GET, HEAD' } })
    // Turnstile の site key は config の var（未設定なら入口の島は入力を出さない）。手元は本番の widget の hostname に無いので試験用の鍵（.dev.vars の試験用 secret と対）にする
    const siteKey = hostname === 'localhost' || hostname === '127.0.0.1' ? TURNSTILE_TEST_SITE_KEY : (env.TURNSTILE_SITE_KEY ?? '')
    if (pathname === '/') return html(LANDING_HTML.replace('__TURNSTILE_SITE_KEY__', escapeAttr(siteKey)), CACHE)
    if (SESSION_PATH.test(pathname)) return html(CHAT_SHELL_HTML, 'no-store')
    const text = TEXT[pathname]
    if (text) return new Response(text[1], { headers: { 'Content-Type': text[0], 'Cache-Control': CACHE } })
    const binary = pathname === '/fonts/mincho.woff2' ? { type: 'font/woff2', base64: MINCHO_WOFF2 } : BINARY_ASSETS[pathname]
    if (binary) return new Response(Uint8Array.from(atob(binary.base64), (c) => c.charCodeAt(0)), { headers: { 'Content-Type': binary.type, 'Cache-Control': CACHE } })
    return new Response('Not Found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': CACHE } })
  },
}
