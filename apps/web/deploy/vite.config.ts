import { cloudflare } from '@cloudflare/vite-plugin'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [cloudflare({ inspectorPort: 9233 })],
  // 自治体ページはサーバーでも React の画面（jurisdiction/page.tsx）を書くので、chat の部品の `@/` を tsconfig と同じく chat/ へ向ける
  resolve: { alias: { '@': fileURLToPath(new URL('../chat', import.meta.url)) } },
  // static/ is served as Workers static assets. public/ brand files and the Mincho subset are inlined into the Worker (assets.ts, font.generated.ts).
  publicDir: '../static',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
})
