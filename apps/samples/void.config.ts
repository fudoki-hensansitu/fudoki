// 小さなサンプル（fudoki.dev/spending など）をまとめて配る Worker（fudoki-samples）。サンプルごとに Worker を分けず、頁は pages/<名前>/、その他のコードは <名前>/ に置く。
// 自分の入口（custom domain・workers.dev）は持たず、本体の Worker（fudoki、apps/web）が各サンプルの path と /samples/assets の下を Service Binding で渡す。
// web と Worker を分けておくのは、web の ISR のキャッシュが deploy のたびに空になるため（サンプルの deploy で本体のキャッシュを捨てない）。
// データ（D1・KV・R2）の binding は持たず、風土記の本体の Worker（fudoki）を Service Binding で読むだけにする（server/fudoki.ts）
import { defineConfig } from 'void/config'

export default defineConfig({
  head: {
    htmlAttrs: { lang: 'ja' },
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { name: 'theme-color', content: '#ffffff' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: '風土記（fudoki）' },
      { property: 'og:locale', content: 'ja_JP' },
      // spending のまちの頁はそのまちのレシートの画像に替える（pages/spending/[code].server.ts）
      { property: 'og:image', content: 'https://fudoki.dev/og.png' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    link: [{ rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
  },
  worker: {
    compatibility_date: '2026-11-09',
  },
  cloudflare: {
    name: 'fudoki-samples',
    workers_dev: false,
    observability: { enabled: true, head_sampling_rate: 1 },
    services: [{ binding: 'FUDOKI', service: 'fudoki' }],
  },
})
