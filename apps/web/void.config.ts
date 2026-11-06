// 公開 web の Worker（fudoki）の設定。build（vite build）が dist/ssr/wrangler.json に書き出し、deploy は wrangler がそれを読む。
// データ（D1・R2・KV など）の binding は持たせず、データは apps/api に Service Binding で聞く（pipeline/verify/boundaries.ts が検査する）
import { defineConfig } from 'void/config'

// 本番と PR ごとの preview（wrangler preview）で同じにする binding。preview は previews に書いたものしか持たないので、両方に渡す
const shared = {
  ai: { binding: 'AI' },
  // 風土記の MCP（apps/api）。workers.dev を閉じているので Worker 間で直接呼ぶ
  services: [{ binding: 'API', service: 'fudoki-api' }],
  // 値は server/limits.ts の CHAT_RATE_LIMIT・VIEW_RATE_LIMIT と同じ（試験が照合する）。namespace は apps/api の 1001 と別にする
  ratelimits: [
    { name: 'CHAT_RATE_LIMIT', namespace_id: '1002', simple: { limit: 10, period: 60 } },
    { name: 'VIEW_RATE_LIMIT', namespace_id: '1003', simple: { limit: 60, period: 60 } },
  ],
}
const vars = {
  // Workers AI のモデル ID。tool 呼び出し（function calling）に対応し、日本語を扱えるものを選ぶ
  CHAT_MODEL: '@cf/deepseek-ai/deepseek-v4.1-flash-1017',
  // 推論の深さ（low・medium・high、none で切る）。考える分も出力 token に数えるので、案内役の応答には low で足りる
  CHAT_REASONING_EFFORT: 'low',
}

export default defineConfig({
  head: {
    htmlAttrs: { lang: 'ja' },
    meta: [{ charset: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }],
  },
  worker: {
    compatibility_date: '2026-08-23',
    vars: {
      ...vars,
      // Turnstile の site key（公開値）。Cloudflare の dashboard で widget を作って書く。空の間は入口の入力を出さない。
      // secret key は本番の Worker の secret に手で置く（TURNSTILE_SECRET_KEY）
      TURNSTILE_SITE_KEY: '0x4AAAAAAFbNaowr2DVLbWDn',
    },
  },
  cloudflare: {
    name: 'fudoki',
    // PR ごとの preview（.github/workflows/preview-web.yml）を pr-<番号>.fudoki.dev で出す（*.fudoki.dev の DNS・証明書は Cloudflare が作る。api・docs は明示のレコードが勝つ）
    routes: [{ pattern: 'fudoki.dev', custom_domain: true, previews_enabled: true }],
    workers_dev: false,
    observability: { enabled: true, head_sampling_rate: 1, traces: { enabled: true, head_sampling_rate: 1 } },
    ...shared,
    // 利用状況（時刻・モデル・token 数・tool の回数・段数・所要時間・失敗の有無）。会話の本文と IP は書かない。
    // preview には渡さない（本番の集計に混ぜない。dataset が無ければ server/usage.ts は何もしない）
    analytics_engine_datasets: [{ binding: 'CHAT_USAGE', dataset: 'fudoki_web_chat' }],
    previews: {
      ...shared,
      // preview（Access で保護済み）は AI エージェントも操作できるよう、Cloudflare が公開している「常に通る」試験用の鍵にする
      // （本番の widget の hostname は fudoki.dev で、pr-<番号>.fudoki.dev では動かない）。secret も公開の試験用の値なので var で渡す
      vars: { ...vars, TURNSTILE_SITE_KEY: '1x00000000000000000000AA', TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' },
    },
  },
})
