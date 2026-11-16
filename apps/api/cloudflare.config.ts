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
      // web の Worker だけが Service Binding で呼ぶ内部の RPC（src/web-entrypoint.ts）。web が api を読む口（ADR 0044）
      Web: exports.worker(),
    },
    // URL の query をログ・trace に残さない（誤って query に付けられた API キーを残さない）
    observability: { enabled: true, headSamplingRate: 1, redactQueryString: true, traces: { enabled: true, headSamplingRate: 1 } },
    env: {
      DB: bindings.d1({ name: 'fudoki-api', id: 'b9b6f209-083e-45b3-a896-1014a17a15f9' }),
      ORIGIN_PDF: bindings.durableObject({ worker: 'fudoki-api', exportName: 'OriginPdfRelay' }),
      // 公開の REST の API キー（docs/prd/public-api-auth/dd.md）。値は Cloudflare の Worker の secret に置く
      WORKOS_API_KEY: bindings.secret(),
      WORKOS_DEVELOPERS_ORG_ID: bindings.secret(),
      // 検証に失敗した要求の IP ごとの上限。超えた IP は 60 秒 WorkOS を呼ばずに断る
      API_KEY_FAILURES: bindings.rateLimit({ namespace: '1001', simple: { limit: 10, period: 60 } }),
      // 利用者ごとの上限。拠点ごとの近似で数える
      API_CALLER_LIMIT: bindings.rateLimit({ namespace: '1002', simple: { limit: 60, period: 60 } }),
      API_CALLS: bindings.analyticsEngineDataset({ name: 'fudoki_api_calls' }),
    },
  },
})
