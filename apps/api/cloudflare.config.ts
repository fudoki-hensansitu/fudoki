import { bindings, defineConfig, exports } from '@cloudflare/config/public'

export default defineConfig({
  worker: {
    name: 'fudoki-api',
    compatibilityDate: '2026-08-23',
    entrypoint: 'src/index.ts',
    domains: ['api.fudoki.dev'],
    workersDev: false,
    previewUrls: false,
    limits: { cpuMs: 200 },
    exports: {
      OriginPdfRelay: exports.durableObject({ storage: 'sqlite' }),
      // 事業評価の検索（AI Search）の回数を数えていた。class を消したので namespace を退役させる
      EvaluationSearchQuota: exports.durableObject({ state: 'deleted' }),
      // web のアシスタントだけが Service Binding で呼ぶ内部の RPC（src/source-pages-entrypoint.ts）
      SourcePages: exports.worker(),
    },
    observability: { enabled: true, headSamplingRate: 1, traces: { enabled: true, headSamplingRate: 1 } },
    env: {
      DB: bindings.d1({ name: 'fudoki-api', id: 'b9b6f209-083e-45b3-a896-1014a17a15f9' }),
      ORIGIN_PDF: bindings.durableObject({ worker: 'fudoki-api', exportName: 'OriginPdfRelay' }),
    },
  },
})
