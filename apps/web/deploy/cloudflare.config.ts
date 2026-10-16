import { defineConfig } from '@cloudflare/config/public'

export default defineConfig({
  worker: {
    name: 'fudoki',
    compatibilityDate: '2026-08-23',
    entrypoint: '../worker.ts',
    domains: ['fudoki.dev'],
    // static/ の重いファイル（ホームの動画・原典の切り抜き）だけを assets で配る。合わない path は Worker が答える
    assets: { notFoundHandling: 'none' },
  },
})
