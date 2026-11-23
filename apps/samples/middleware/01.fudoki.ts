// 自治体の検索・1年度のデータ・紋章・レシートの OG 画像は、風土記の本体（fudoki.dev）の同じ path をそのまま中継する（server/fudoki.ts）。
// 画面は自分の origin だけを呼び、このサイトは何も保存しない。HTML には CSP と noindex でない既定の header を付ける
import { defineMiddleware } from 'void'
import { fudokiFetch, relayed, type Env } from '../server/fudoki'

// 「現在地から選ぶ」が緯度・経度を渡す国土地理院の逆ジオコーダー（lib/locate.ts）
const GSI_GEOCODER = 'https://mreversegeocoder.gsi.go.jp'
const CSP = [
  "default-src 'self'",
  // Void が HTML に書く inline の script（頁のデータ）を許す
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  `connect-src 'self' ${GSI_GEOCODER}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

export default defineMiddleware(async (c, next) => {
  const path = c.req.path
  if ((c.req.method === 'GET' || c.req.method === 'HEAD') && relayed(path)) {
    const r = await fudokiFetch(c.env as unknown as Env, c.req.raw.headers, `${path}${new URL(c.req.url).search}`)
    // 本体の応答の header（Cache-Control など）はそのまま。cookie は渡さない
    const headers = new Headers(r.headers)
    headers.delete('set-cookie')
    return new Response(r.body, { status: r.status, headers })
  }
  await next()
  if (c.res.headers.get('Content-Type')?.startsWith('text/html') && !c.res.headers.has('Content-Security-Policy')) c.res.headers.set('Content-Security-Policy', CSP)
})
