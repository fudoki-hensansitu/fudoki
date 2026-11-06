// 公開 web（fudoki.dev）を Void で build する。自治体の一覧・都道府県・市区町村の頁は pages/（Void の Pages mode）で、
// 入口の1枚・会話（/s/:id）・API など、まだ pages/ に移していない経路は middleware/01.legacy.ts が worker.ts の Hono に渡す
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
  // static/ の重いファイル（ホームの動画・出典の切り抜き）と、入口・会話の島の JS・CSS（_app/、chat/build.ts が作る）を assets で配る
  publicDir: 'static',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
})
