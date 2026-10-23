import { bindings, defineConfig } from '@cloudflare/config/public'

// isPreview は PR ごとの preview（cf previews deploy）で評価するとき true
export default defineConfig(({ isPreview }) => ({
  worker: {
    name: 'fudoki',
    compatibilityDate: '2026-08-23',
    entrypoint: '../worker.ts',
    // PR ごとの preview を pr-<番号>.fudoki.dev で出す（*.fudoki.dev の DNS・証明書は Cloudflare が作る。api・docs は明示のレコードが勝つ）
    domains: [{ hostname: 'fudoki.dev', production: true, previews: true }],
    // static/ の重いファイル（ホームの動画・出典の切り抜き）と会話の画面の JS・CSS（_app/、build で作る）を assets で配る。合わない path は Worker が答える
    assets: { notFoundHandling: 'none' },
    observability: { enabled: true, headSamplingRate: 1 },
    env: {
      AI: bindings.ai(),
      // 風土記の MCP（apps/api）。workers.dev を閉じているので Worker 間で直接呼ぶ
      API: bindings.worker({ worker: 'fudoki-api' }),
      // 値は server/limits.ts の CHAT_RATE_LIMIT・VIEW_RATE_LIMIT と同じ（試験が照合する）。namespace は apps/api の 1001 と別にする
      CHAT_RATE_LIMIT: bindings.rateLimit({ namespace: '1002', simple: { limit: 10, period: 60 } }),
      VIEW_RATE_LIMIT: bindings.rateLimit({ namespace: '1003', simple: { limit: 60, period: 60 } }),
      // 利用状況（時刻・モデル・token 数・tool の回数・段数・所要時間・失敗の有無）。会話の本文と IP は書かない
      // preview では書かない（本番の集計に混ぜない。dataset が無ければ server/usage.ts は何もしない）
      ...(isPreview ? {} : { CHAT_USAGE: bindings.analyticsEngineDataset({ name: 'fudoki_web_chat' }) }),
      // Workers AI のモデル ID。tool 呼び出し（function calling）に対応し、日本語を扱えるものを選ぶ。
      CHAT_MODEL: bindings.text('@cf/deepseek-ai/deepseek-v4.1-flash-1017'),
      // 推論の深さ（low・medium・high、none で切る）。考える分も出力 token に数えるので、案内役の応答には low で足りる
      CHAT_REASONING_EFFORT: bindings.text('low'),
      // Turnstile の site key（公開値）。Cloudflare の dashboard で widget を作って書く。空の間は入口の入力を出さない
      // preview（Access で保護済み）は AI エージェントも操作できるよう、Cloudflare が公開している「常に通る」試験用の鍵にする（本番の widget の hostname は fudoki.dev で、pr-<番号>.fudoki.dev では動かない）
      TURNSTILE_SITE_KEY: bindings.text(isPreview ? '1x00000000000000000000AA' : '0x4AAAAAAFbNaowr2DVLbWDn'),
      // Turnstile の secret key（本番はコードに書かず Worker の secret に手で置く。cf dev はここに宣言した名前だけを deploy/.dev.vars から読む）。preview は試験用の secret（公開値）
      TURNSTILE_SECRET_KEY: isPreview ? bindings.text('1x0000000000000000000000000000000AA') : bindings.secret(),
    },
  },
}))
