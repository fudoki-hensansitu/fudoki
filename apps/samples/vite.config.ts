import tailwindcss from '@tailwindcss/vite'
import { voidReact } from '@void/react/plugin'
import { voidPlugin } from 'void'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [voidPlugin(), voidReact(), tailwindcss()],
  // 本体（fudoki.dev）の /assets と分けるため、build の資産を /samples/assets に置く（本体の middleware が /samples の下もこの Worker へ渡す）
  build: { assetsDir: 'samples/assets' },
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
})
