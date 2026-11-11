import { defineConfig } from 'blume'
import { openapi } from 'blume/reference'
import { readFileSync } from 'node:fs'

// API リファレンスの各頁は operationId を kebab-case にした route に出る
const spec = JSON.parse(readFileSync('openapi.json', 'utf8')) as {
  paths: Record<string, Record<string, { operationId: string }>>
}
const operationRoutes = Object.values(spec.paths)
  .flatMap((methods) => Object.values(methods))
  .map((op) => `/reference/operations/${op.operationId.replaceAll('_', '-')}`)

export default defineConfig({
  title: '風土記 Docs',
  description: '私のお金はどこへ行った？ 自治体の予算・決算・事業評価をわかりやすく見せ、オープンデータにする風土記を、MCP と REST で使うための文書。',
  // ロゴは本体サイト（fudoki.dev）への戻り口にする。別の「サイトへ戻る」リンクは置かない
  logo: { image: { light: '/logo.svg', dark: '/logo-dark.svg', alt: '風土記' }, text: '', href: 'https://fudoki.dev/' },
  content: { root: 'content' },
  i18n: { defaultLocale: 'ja', locales: [{ code: 'ja', label: '日本語' }] },
  // 色・書体・サイドバーは theme.css で本体サイトに揃える
  theme: { accent: { light: '#2f5d43', dark: '#8fbfa2' }, mode: 'system' },
  deployment: { site: 'https://docs.fudoki.dev' },
  navigation: {
    tabs: [
      { label: 'ガイド', path: '/' },
      { label: 'API リファレンス', path: '/reference' },
    ],
    // サポート・規約はサイドバーのヘルプに並べる。API リファレンスの行も含め、サイドバーは明示で組む
    sidebar: [
      '/',
      { label: 'AI につなぐ', items: ['/mcp', '/chatgpt', '/claude', '/codex', '/claude-code', '/cursor'] },
      { label: 'プログラムから使う', items: ['/rest'] },
      { label: 'データ', items: ['/data', '/evaluations'] },
      { label: 'ヘルプ', items: ['/support', '/privacy', '/terms'] },
      // 明示のサイドバーでは API リファレンスの行も自動では作られないので、openapi.json の順に並べる。root を持つ group にするとタブで切り分けられる
      { label: 'API リファレンス', root: '/reference', items: operationRoutes },
    ],
    repo: 'https://github.com/fudoki-hensansitu/fudoki',
  },
  // footer はアイコンと © だけ。サポート・規約はサイドバーのヘルプに置く
  footer: {
    copyright: '© 2026 風土記',
    socials: { x: 'https://x.com/fudokijp' },
  },
  // 旧「ChatGPT・Claude などで使う」の頁。plugin の導入はクライアント別の頁へ移した
  redirects: [{ from: '/plugins', to: '/claude-code' }],
  // openapi.json は apps/api の route 定義から build の前に書き出す（package.json の openapi）。
  // API は CORS を返さないので、ブラウザから送る Try it は出さない。
  reference: [openapi({ spec: './openapi.json', playground: false })],
})
