// ホーム画面に追加できるようにするための manifest・service worker・オフライン時の頁。
// service worker は「繋がらないときの案内」だけを持つ。会話・データは常に通信で取るので、頁も API もキャッシュしない
export const MANIFEST = JSON.stringify({
  name: '風土記（fudoki）— 町の家計簿',
  short_name: '風土記',
  description: '日本の自治体の支出の予算と決算を事業ごとに集め、AI から問い合わせられるデータとして配る。',
  lang: 'ja',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#ffffff',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
})

/** 各頁の <head> に入れる、manifest と iOS のホーム画面用の指定 */
export const PWA_HEAD = `<link rel="manifest" href="/manifest.webmanifest">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="風土記">`

export const PWA_REGISTER = `<script>if('serviceWorker'in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}))</script>`

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

export const OFFLINE_PATH_NAME = OFFLINE_PATH

export const OFFLINE_HTML = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>オフライン — 風土記</title>
<meta name="robots" content="noindex">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1b1916" media="(prefers-color-scheme: dark)">
<style>
:root{color-scheme:light dark;--bg:#ffffff;--fg:#1b1916}
@media(prefers-color-scheme:dark){:root{--bg:#1b1916;--fg:#f3f0ea}}
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--fg);font:400 16px/1.8 system-ui,sans-serif;text-align:center}
button{margin-top:16px;font:inherit;padding:10px 24px;border-radius:999px;border:1px solid currentColor;background:transparent;color:inherit}
</style>
</head>
<body>
<main><h1 style="font-size:1.25rem;font-weight:600">ネットワークに繋がっていません</h1><p>風土記は通信して答えを探します。繋がってからもう一度開いてください。</p><button onclick="location.reload()">再読み込み</button></main>
</body>
</html>
`
