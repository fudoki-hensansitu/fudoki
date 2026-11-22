// spending.fudoki.dev の Worker（fudoki-spending）。データ（D1・KV・R2）の binding は持たず、風土記の本体の Worker（fudoki）を Service Binding で読むだけにする（server/fudoki.ts）
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
      // まちの頁はそのまちのレシートの画像に替える（pages/[code].server.ts）
      { property: 'og:image', content: 'https://spending.fudoki.dev/og.png' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    link: [{ rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
  },
  worker: {
    compatibility_date: '2026-11-09',
  },
  cloudflare: {
    name: 'fudoki-spending',
    routes: [{ pattern: 'spending.fudoki.dev', custom_domain: true }],
    workers_dev: false,
    observability: { enabled: true, head_sampling_rate: 1 },
    services: [{ binding: 'FUDOKI', service: 'fudoki' }],
  },
})
