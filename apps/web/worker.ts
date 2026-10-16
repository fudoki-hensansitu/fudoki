import { BINARY_ASSETS } from './assets'
import { MINCHO_WOFF2 } from './font.generated'
import { FAVICON_SVG, LANDING_HTML } from './landing'

// 入口の1枚と、検索エンジン・ブラウザが取りに来る小さなファイルだけを配る。データの提供は api.fudoki.dev、文書は docs.fudoki.dev
const CACHE = 'public, max-age=300'
const ROBOTS = 'User-agent: *\nAllow: /\nSitemap: https://fudoki.dev/sitemap.xml\n'
const SITEMAP = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://fudoki.dev/</loc></url></urlset>\n'

const TEXT: Record<string, [string, string]> = {
  '/': ['text/html; charset=utf-8', LANDING_HTML],
  '/favicon.svg': ['image/svg+xml', FAVICON_SVG],
  '/robots.txt': ['text/plain; charset=utf-8', ROBOTS],
  '/sitemap.xml': ['application/xml; charset=utf-8', SITEMAP],
}

export default {
  fetch(request: Request) {
    const { pathname } = new URL(request.url)
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed\n', { status: 405, headers: { Allow: 'GET, HEAD' } })
    const text = TEXT[pathname]
    if (text) return new Response(text[1], { headers: { 'Content-Type': text[0], 'Cache-Control': CACHE } })
    const binary = pathname === '/fonts/mincho.woff2' ? { type: 'font/woff2', base64: MINCHO_WOFF2 } : BINARY_ASSETS[pathname]
    if (binary) return new Response(Uint8Array.from(atob(binary.base64), (c) => c.charCodeAt(0)), { headers: { 'Content-Type': binary.type, 'Cache-Control': CACHE } })
    return new Response('Not Found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': CACHE } })
  },
}
