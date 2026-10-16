import { FAVICON_SVG, LANDING_HTML } from './landing'

// 入口の1枚だけを配る。データの提供は api.fudoki.dev、文書は docs.fudoki.dev
const CACHE = 'public, max-age=300'

export default {
  fetch(request: Request) {
    const { pathname } = new URL(request.url)
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed\n', { status: 405, headers: { Allow: 'GET, HEAD' } })
    if (pathname === '/') return new Response(LANDING_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': CACHE } })
    if (pathname === '/favicon.svg') return new Response(FAVICON_SVG, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': CACHE } })
    if (pathname === '/robots.txt') return new Response('User-agent: *\nAllow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': CACHE } })
    return new Response('Not Found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': CACHE } })
  },
}
