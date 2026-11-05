import { defineConfig } from 'blume'
import { openapi } from 'blume/reference'

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
    repo: 'https://github.com/fudoki-hensansitu/fudoki',
  },
  footer: {
    links: [
      { label: 'サポート', href: '/support' },
      { label: 'プライバシーポリシー', href: '/privacy' },
      { label: '利用規約', href: '/terms' },
    ],
  },
  // 旧「ChatGPT・Claude などで使う」の頁。plugin の導入はクライアント別の頁へ移した
  redirects: [{ from: '/plugins', to: '/claude-code' }],
  // openapi.json は apps/api の route 定義から build の前に書き出す（package.json の openapi）。
  // API は CORS を返さないので、ブラウザから送る Try it は出さない。
  reference: [openapi({ spec: './openapi.json', playground: false })],
})
