import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [cloudflare({ inspectorPort: 9233 })],
  // public/ holds brand assets; the Worker still answers every path itself.
  publicDir: false,
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
})
