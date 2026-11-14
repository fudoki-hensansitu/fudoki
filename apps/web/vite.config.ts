// 公開 web（fudoki.dev）を Void で build する。頁は pages/（Void の Pages）、API・sitemap・service worker は routes/、
// 画像・フォント・録画など手で置くファイルは public/（Vite の既定）から assets として配る
import tailwindcss from '@tailwindcss/vite'
import { voidReact } from '@void/react/plugin'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { voidPlugin } from 'void'

// void は void.config.ts の custom domain の route を cf の domains の文字列（本番だけ）に移し、wrangler の previews_enabled を移せない。
// 文字列のまま deploy すると fudoki.dev の Preview（pr-<番号>.fudoki.dev）が止まるので、build の出力で本番と Preview の両方を出す形に書き換える
const PREVIEW_DOMAIN = 'fudoki.dev'
const WORKER_CONFIG = fileURLToPath(new URL('./.cloudflare/output/v0/workers/default/worker.config.json', import.meta.url))
const previewDomains = (): Plugin => ({
  name: 'fudoki:preview-domains',
  // Cloudflare の plugin は worker.config.json を buildApp（post）で書くので、その後に書き換える
  buildApp: {
    order: 'post',
    async handler() {
      if (!existsSync(WORKER_CONFIG)) return
      const config = JSON.parse(readFileSync(WORKER_CONFIG, 'utf8')) as { domains?: (string | { hostname: string })[] }
      if (!config.domains?.includes(PREVIEW_DOMAIN)) return
      config.domains = config.domains.map((d) => (d === PREVIEW_DOMAIN ? { hostname: d, production: true, previews: true } : d))
      writeFileSync(WORKER_CONFIG, JSON.stringify(config))
    },
  },
})

export default defineConfig({
  plugins: [voidPlugin(), voidReact(), tailwindcss(), previewDomains()],
  // chat の部品の `@/` を tsconfig と同じく chat/ へ向ける
  resolve: { alias: { '@': fileURLToPath(new URL('./chat', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
})
