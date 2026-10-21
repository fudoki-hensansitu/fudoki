import { defineConfig } from 'blume'
import { openapi } from 'blume/reference'

export default defineConfig({
  title: '風土記 API Docs',
  description: '町の家計簿を作る。自治体の歳出の予算・決算を事業の単位まで集約したデータを、MCP と REST で取得するための文書。',
  logo: { image: { light: '/logo.svg', dark: '/logo-dark.svg', alt: '風土記' }, text: '' },
  content: { root: 'content' },
  i18n: { defaultLocale: 'ja', locales: [{ code: 'ja', label: '日本語' }] },
  theme: { accent: '#2f5d43', mode: 'system' },
  deployment: { site: 'https://docs.fudoki.dev' },
  navigation: {
    tabs: [
      { label: 'ガイド', path: '/' },
      { label: 'API リファレンス', path: '/reference' },
    ],
    repo: 'https://github.com/wwwyo/fudoki',
    featured: [{ label: '風土記に戻る', href: 'https://fudoki.dev/', icon: 'arrow-left' }],
  },
  footer: {
    links: [
      { label: '風土記（ホーム）', href: 'https://fudoki.dev/' },
      { label: 'プライバシーポリシー', href: '/privacy' },
      { label: '利用規約', href: '/terms' },
    ],
  },
  // openapi.json は apps/api の route 定義から build の前に書き出す（package.json の openapi）。
  // API は CORS を返さないので、ブラウザから送る Try it は出さない。
  reference: [openapi({ spec: './openapi.json', playground: false })],
})
