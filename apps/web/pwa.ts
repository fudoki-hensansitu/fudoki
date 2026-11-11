// ホーム画面に追加できるようにするための manifest・service worker・オフライン時の頁（routes/ の manifest.webmanifest・sw.js・offline が返す）。
// head の manifest の link と service worker の登録は void.config.ts の head。
// service worker は「繋がらないときの案内」だけを持つ。会話・データは常に通信で取るので、頁も API もキャッシュしない
import { BACKGROUND_DARK, BACKGROUND_LIGHT } from './tokens'
export const MANIFEST = JSON.stringify({
  name: '風土記（fudoki）— 私のお金はどこへ行った？',
  short_name: '風土記',
  description: '私のお金はどこへ行った？ 風土記は、自治体が何にいくら使い、どう振り返ったかを、事業ごとにわかりやすく見せるサイトです。ほかのまちと同じ物差しで比べられ、出典の資料まで辿れます。',
  lang: 'ja',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: BACKGROUND_LIGHT,
  theme_color: BACKGROUND_LIGHT,
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
})

/** head に inline で置く service worker の登録。CSP（server/csp.ts）はこの文字列の hash で許す */
export const SW_REGISTER = "if('serviceWorker'in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}))"

const OFFLINE_PATH = '/offline'
const CACHE_NAME = 'fudoki-offline-v1'

export const SERVICE_WORKER = `const CACHE = '${CACHE_NAME}'
const OFFLINE = '${OFFLINE_PATH}'
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE)).then(() => self.skipWaiting())))
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())))
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)))
})
`

export const OFFLINE_HTML = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>オフライン — 風土記</title>
<meta name="robots" content="noindex">
<style>
:root{color-scheme:light dark;--bg:${BACKGROUND_LIGHT};--fg:#1b1916}
@media(prefers-color-scheme:dark){:root{--bg:${BACKGROUND_DARK};--fg:#f3f0ea}}
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--fg);font:400 16px/1.8 system-ui,sans-serif;text-align:center}
a.reload{display:inline-block;text-decoration:none;margin-top:16px;font:inherit;padding:10px 24px;border-radius:999px;border:1px solid currentColor;background:transparent;color:inherit}
</style>
</head>
<body>
<main><h1 style="font-size:1.25rem;font-weight:600">ネットワークに繋がっていません</h1><p>風土記は通信して答えを探します。繋がってからもう一度開いてください。</p><a class="reload" href="">再読み込み</a></main>
</body>
</html>
`
