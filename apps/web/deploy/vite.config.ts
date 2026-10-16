import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [cloudflare({ inspectorPort: 9233 })],
  // static/ is served as Workers static assets. public/ brand files and the Mincho subset are inlined into the Worker (assets.ts, font.generated.ts).
  publicDir: '../static',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
})
