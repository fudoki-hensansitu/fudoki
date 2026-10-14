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
      EvaluationSearchQuota: exports.durableObject({ storage: 'sqlite' }),
    },
    observability: { enabled: true, headSamplingRate: 1 },
    env: {
      DB: bindings.d1({ name: 'fudoki-api', id: 'b9b6f209-083e-45b3-a896-1014a17a15f9' }),
      ORIGIN_PDF: bindings.durableObject({ worker: 'fudoki-api', exportName: 'OriginPdfRelay' }),
      EVALUATION_SEARCH: bindings.aiSearch({ name: 'fudoki-evaluation-v1' }),
      // 値は src/evaluation-limits.ts の IP_RATE_LIMIT と同じ（試験が照合する）。config が import したファイルは cf dev の Worker から読めないので共有しない
      EVALUATION_RATE_LIMIT: bindings.rateLimit({ namespace: '1001', simple: { limit: 10, period: 60 } }),
      EVALUATION_QUOTA: bindings.durableObject({ worker: 'fudoki-api', exportName: 'EvaluationSearchQuota' }),
    },
  },
})
