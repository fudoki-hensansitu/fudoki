// 公開 web の Worker（fudoki）の設定。build（vite build）が cf の形で .cloudflare/output/v0 に書き出し、deploy・preview は cf がそれを読む。
// データ（D1・R2・KV など）の binding は持たせず、データは apps/api に Service Binding で聞く（pipeline/verify/boundaries.ts が検査する）。
// 例外は web 自身のデータの D1（binding DB・fudoki-web。AI との会話の保存と、外部サービスから引く参照データ）だけ。風土記のデータではなく、web だけが使う別の D1 にする
import { defineConfig } from 'void/config'
import { SW_REGISTER } from './pwa'
import { THEME_SCRIPT } from './nav/theme'
import { NAV_SCRIPT } from './nav/nav-state'

// PR ごとの preview の build か。cf previews deploy と deploy-preview-web.yml が CLOUDFLARE_PREVIEW_BUILD=true で build する。
// void は Cloudflare の設定を cf の形へ移すとき wrangler の previews を受け付けないので、preview の差し替えはここで分ける
const preview = process.env.CLOUDFLARE_PREVIEW_BUILD === 'true'

// 本番と preview で同じにする binding
const shared = {
  ai: { binding: 'AI' },
  // 風土記の MCP（apps/api）。workers.dev を閉じているので Worker 間で直接呼ぶ
  services: [
    { binding: 'API', service: 'fudoki-api' },
    // 出典の頁の文字を読む内部の RPC（apps/api の SourcePages）。R2 の binding は apps/api だけが持つ
    { binding: 'SOURCES', service: 'fudoki-api', entrypoint: 'SourcePages' },
  ],
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
  // CDN（Void の ISR）に置く応答。ISR_CACHE（KV、下の cloudflare.kv_namespaces）に置き、過ぎたら古い応答を返しながら裏で作り直す。
  // 自治体の頁は各頁の .server.ts の revalidate。cookie の付いた要求・/api の下・200 でない応答・no-store の応答は置かない。deploy のたびに空になる
  routing: {
    revalidate: {
      // 画面が取る自治体のデータ（routes/data/）。データは取り込みのときだけ変わる
      '/data/*': 3600,
      '/sitemap.xml': 3600,
      // 自治体の OG 画像（routes/jurisdictions/[code]/og.png.ts）。最新の決算の金額から描く。経路の表の `/:prefecture/:name/:year` に先に当たるので、応答の x-revalidate でも1日にする
      '/jurisdictions/*': 86400,
    },
    // ISR の key は既定で query を落とす。流れ図・会計の総額は query で表示を分けるので key に残す
    revalidateQueryAllowlist: {
      '/data/jurisdictions/flow/*': ['view', 'phase', 'account'],
      '/data/jurisdictions/accounts/*': ['phase'],
    },
  },
  // 全頁の head の既定。頁ごとの title・説明・canonical は各頁の .server.ts の head。theme-color と View Transition の opt-in は middleware/01.site.ts
  head: {
    htmlAttrs: { lang: 'ja' },
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      // ホーム画面に追加できるようにする（manifest は routes/manifest.webmanifest.ts）
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-title', content: '風土記' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: '風土記（fudoki）' },
      { property: 'og:locale', content: 'ja_JP' },
      { property: 'og:image', content: 'https://fudoki.dev/og.png' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    link: [
      { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/manifest.webmanifest' },
      // AI 向けの案内（public/llms.txt）。API・MCP の文書は docs.fudoki.dev の llms.txt を指す
      { rel: 'llms-txt', href: '/llms.txt' },
    ],
    // service worker（routes/sw.js.ts）は繋がらないときの案内だけを持つ。
    // テーマ（nav/theme.ts）とサイドバーの開閉（nav/nav-state.ts）は描く前に当てる。サーバーはどちらでも HTML を書き分けない
    script: [{ innerHTML: THEME_SCRIPT }, { innerHTML: NAV_SCRIPT }, { innerHTML: SW_REGISTER }],
  },
  worker: {
    compatibility_date: '2026-08-23',
    vars: preview
      ? // preview（Access で保護済み）は AI エージェントも操作できるよう、Cloudflare が公開している「常に通る」試験用の鍵にする
        // （本番の widget の hostname は fudoki.dev で、pr-<番号>.fudoki.dev では動かない）。secret も公開の試験用の値なので var で渡す
        { ...vars, TURNSTILE_SITE_KEY: '1x00000000000000000000AA', TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' }
      : {
          ...vars,
          // Turnstile の site key（公開値）。Cloudflare の dashboard で widget を作って書く。空の間は入口の入力を出さない。
          // secret key は本番の Worker の secret に手で置く（TURNSTILE_SECRET_KEY）
          TURNSTILE_SITE_KEY: '0x4AAAAAAFbNaowr2DVLbWDn',
        },
  },
  cloudflare: {
    name: 'fudoki',
    // void はこの route を cf の domains の文字列（本番だけ）に移す。PR ごとの preview を pr-<番号>.fudoki.dev で出す設定は
    // vite.config.ts の previewDomains が build の出力に足す（*.fudoki.dev の DNS・証明書は Cloudflare が作る。api・docs は明示のレコードが勝つ）
    routes: [{ pattern: 'fudoki.dev', custom_domain: true }],
    workers_dev: false,
    observability: { enabled: true, head_sampling_rate: 1, traces: { enabled: true, head_sampling_rate: 1 } },
    ...shared,
    // web 自身のデータの D1。preview は別の D1（fudoki-web-preview）にし、試した会話を本番の記録に混ぜない。
    // migration は deploy-web・deploy-preview-web が deploy の前に当てる。人口は scripts/sync-data/population.py が両方に入れる
    d1_databases: [
      preview
        ? { binding: 'DB', database_name: 'fudoki-web-preview', database_id: '5b2c16b3-f008-4901-8660-2c66db3c714d', migrations_dir: 'migrations' }
        : { binding: 'DB', database_name: 'fudoki-web', database_id: '760c7476-6e46-4b44-b174-1bfdd1b4f957', migrations_dir: 'migrations' },
    ],
    // CDN（Void の ISR）が描いた HTML・データを置く KV。風土記のデータではなく、応答の写しだけを置く。preview は別の KV にする
    kv_namespaces: [{ binding: 'ISR_CACHE', id: preview ? '37ad90e0b46d4d6a996f1aa4e794fa58' : '381b42a1f4334609b917b794d9feb9b7' }],
    // 以下は本番だけ。preview には渡さない
    ...(preview
      ? {}
      : {
          // 利用状況（時刻・モデル・token 数・tool の回数・段数・所要時間・失敗の有無）。会話の本文と IP は書かない。
          // 本番の集計に混ぜない（dataset が無ければ server/usage.ts は何もしない）
          analytics_engine_datasets: [{ binding: 'CHAT_USAGE', dataset: 'fudoki_web_chat' }],
        }),
  },
})
