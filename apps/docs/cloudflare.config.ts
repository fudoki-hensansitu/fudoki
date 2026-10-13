import { bindings, defineConfig } from '@cloudflare/config/public'

export default defineConfig({
  worker: {
    name: 'fudoki-docs',
    compatibilityDate: '2026-08-23',
    entrypoint: 'worker.ts',
    domains: ['docs.fudoki.dev'],
    env: { ASSETS: bindings.assets() },
    // Blume の URL は末尾の / なし。無いと /mcp が /mcp/ へ 307 になる
    assets: { htmlHandling: 'drop-trailing-slash', notFoundHandling: '404-page' },
  },
})
