import { defineConfig } from '@cloudflare/config/public'

export default defineConfig({
  worker: {
    name: 'fudoki-docs',
    compatibilityDate: '2026-08-23',
    domains: ['docs.fudoki.dev'],
    // 入口は docs.fudoki.dev だけにする
    workersDev: false,
    previewUrls: false,
    // Worker のコードは持たず、Blume が書き出した静的ファイルだけを配る。assets への要求は Worker の実行として課金されない
    // Blume の URL は末尾の / なし。無いと /mcp が /mcp/ へ 307 になる
    assets: { htmlHandling: 'drop-trailing-slash', notFoundHandling: '404-page' },
  },
})
