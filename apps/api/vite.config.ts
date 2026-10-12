import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [cloudflare({ inspectorPort: 9237 })],
  publicDir: false,
  server: { host: '127.0.0.1', port: 8787, strictPort: true },
})
