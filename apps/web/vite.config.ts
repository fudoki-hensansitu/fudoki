// 公開 web（fudoki.dev）を Void で build する。頁は pages/（Void の Pages）、API・sitemap・service worker は routes/、
// 画像・フォント・録画など手で置くファイルは public/（Vite の既定）から assets として配る
import tailwindcss from '@tailwindcss/vite'
import { voidReact } from '@void/react/plugin'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { voidPlugin } from 'void'

export default defineConfig({
  // 頁の間の移動（Link・戻る・進む）を View Transition でつなぐ
  plugins: [voidPlugin(), voidReact({ viewTransitions: true }), tailwindcss()],
  // chat の部品の `@/` を tsconfig と同じく chat/ へ向ける
  resolve: { alias: { '@': fileURLToPath(new URL('./chat', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
})
