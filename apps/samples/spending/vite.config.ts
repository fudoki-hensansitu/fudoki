import tailwindcss from '@tailwindcss/vite'
import { voidReact } from '@void/react/plugin'
import { voidPlugin } from 'void'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [voidPlugin(), voidReact(), tailwindcss()],
  // 本体（fudoki.dev）の /assets と分けるため、build の資産を /spending/assets に置く（本体の middleware が /spending の下をこの Worker へ渡す）
  build: { assetsDir: 'spending/assets' },
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
})
