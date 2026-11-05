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
  description: '町の家計簿を作る。自治体の歳出の予算・決算を事業の単位まで集約したデータを、MCP と REST で取得するための文書。',
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
    // footer は置かず、規約とリポジトリもサイドバーに並べる。外部リンクを混ぜるため、ガイドのサイドバーは明示で組む
    sidebar: [
      '/',
      { label: 'AI につなぐ', items: ['/mcp', '/chatgpt', '/claude', '/codex', '/claude-code', '/cursor'] },
      { label: 'プログラムから使う', items: ['/rest'] },
      { label: 'データ', items: ['/data', '/evaluations'] },
      {
        label: 'ヘルプ',
        items: [
          '/support',
          '/privacy',
          '/terms',
          { label: 'GitHub', href: 'https://github.com/fudoki-hensansitu/fudoki', icon: '/icons/github-logo.svg' },
        ],
      },
      // 明示のサイドバーでは API リファレンスの行も自動では作られないので、openapi.json の順に並べる。root を持つ group にするとタブで切り分けられる
      { label: 'API リファレンス', root: '/reference', items: operationRoutes },
    ],
    // footer の GitHub アイコンも出さない（サイドバーのヘルプに置く）
    repo: false,
  },
  // 旧「ChatGPT・Claude などで使う」の頁。plugin の導入はクライアント別の頁へ移した
  redirects: [{ from: '/plugins', to: '/claude-code' }],
  // openapi.json は apps/api の route 定義から build の前に書き出す（package.json の openapi）。
  // API は CORS を返さないので、ブラウザから送る Try it は出さない。
  reference: [openapi({ spec: './openapi.json', playground: false })],
})
