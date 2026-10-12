import { bindings, defineConfig } from '@cloudflare/config/public'

export default defineConfig({
  worker: {
    name: 'fudoki-api',
    compatibilityDate: '2026-08-23',
    entrypoint: 'src/index.ts',
    domains: ['api.fudoki.dev'],
    workersDev: false,
    previewUrls: false,
    limits: { cpuMs: 200 },
    // database id は作成後に入れる
    env: { DB: bindings.d1({ name: 'fudoki-api', id: '00000000-0000-4000-8000-000000000001' }) },
  },
})
