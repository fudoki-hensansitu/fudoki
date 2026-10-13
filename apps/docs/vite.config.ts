import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [cloudflare({ inspectorPort: 9235 })],
  // Blume が書き出した dist/ をそのまま Worker の assets にする。Vite 自身の出力は .build/ に分ける。
  publicDir: 'dist',
  build: { outDir: '.build' },
  server: { host: '127.0.0.1', port: 5175, strictPort: true },
})
